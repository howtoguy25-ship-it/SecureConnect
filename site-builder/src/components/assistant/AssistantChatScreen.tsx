import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  Image,
  StyleSheet,
  ActivityIndicator,
  Keyboard,
  KeyboardEvent,
  Platform,
} from 'react-native';
import { showAlert } from '@/utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '@/context/AuthContext';
import { assistantMessagesStore } from '@/storage/assistantMessagesStore';
import { sendAssistantMessage, executeAssistantAction } from '@/services/assistant';
import { uploadLocalImage } from '@/services/uploads';
import { navigateTo, currentScreenName } from '@/navigation/navigationRef';
import { generateId } from '@/utils/id';
import { projectsStore } from '@/storage/projectsStore';
import { AssistantAction, AssistantMessage, PageType, Project } from '@/types';

interface Props {
  onClose: () => void;
}

const HISTORY_FOR_MODEL = 20;

// Action types that mutate a real project or the account catalog (Phase 8) -- everything
// else is the original navigate-only behavior. `editProduct` needs no project (it resolves
// an account-wide catalog product by name), the rest need a concrete `projectId`.
const CROSS_PROJECT_ACTION_TYPES: AssistantAction['type'][] = [
  'createProduct',
  'editProduct',
  'insertProductOnPage',
  'publishProject',
  'addMenuItem',
];

function navigateAction(action: AssistantAction, onClose: () => void) {
  const pageType: PageType = action.pageType ?? 'website';
  switch (action.type) {
    case 'navigate':
      if (action.screen === 'Projects') navigateTo('Projects');
      else if (action.screen === 'NewProject') navigateTo('NewProject');
      else if (action.screen === 'Subscription') navigateTo('Subscription');
      else if (action.screen === 'Account') navigateTo('Account');
      else if (action.screen === 'Support') navigateTo('Support');
      else if (action.screen === 'SellerAccount') navigateTo('SellerAccount');
      else if (action.screen === 'Orders') navigateTo('Orders');
      else if (action.screen === 'TransferDomain') navigateTo('TransferDomain');
      else if (action.screen === 'Policy') navigateTo('Policy', { policyType: action.policyType ?? 'privacy' });
      else return;
      onClose();
      break;
    case 'startBuildFlow':
      navigateTo('BuildMethod', { pageType });
      onClose();
      break;
    case 'startAIBuild':
      navigateTo('AIPrompt', { pageType, initialPrompt: action.prompt ?? undefined });
      onClose();
      break;
    case 'openSubscription':
      navigateTo('Subscription');
      onClose();
      break;
    case 'openAccount':
      navigateTo('Account');
      onClose();
      break;
  }
}

const MAX_CHAT_IMAGES = 5;

export default function AssistantChatScreen({ onClose }: Props) {
  const { user } = useAuth();
  const uid = user!.uid;
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const listRef = useRef<FlatList<AssistantMessage>>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  // Keyed by the assistant message id that produced it -- an ambiguous cross-project action
  // (projectId null, 2+ real projects to choose from) waits here for the user to pick one via
  // the chip row rendered under that message, rather than guessing which project it meant.
  const [pendingActions, setPendingActions] = useState<Record<string, AssistantAction>>({});

  // This screen is presented inside a `pageSheet` Modal (see AssistantLauncher) --
  // KeyboardAvoidingView's automatic frame measurement is unreliable in that presentation
  // style on iOS and leaves the input mostly hidden behind the keyboard, so the keyboard's
  // real height is tracked manually here and applied as explicit bottom padding instead.
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e: KeyboardEvent) => setKeyboardHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    assistantMessagesStore.list(uid).then((history) => {
      setMessages(history);
      setLoading(false);
    });
  }, [uid]);

  useEffect(() => {
    projectsStore.list(uid).then(setProjects);
  }, [uid]);

  const appendConfirmation = (content: string) => {
    const confirmMessage: AssistantMessage = { id: generateId('msg'), role: 'assistant', content, createdAt: Date.now() };
    setMessages((prev) => [...prev, confirmMessage]);
    assistantMessagesStore.add(uid, confirmMessage).catch(() => {});
  };

  // Runs one of the five real cross-project actions once `action.projectId` is settled --
  // either the assistant matched it confidently, or the user just picked one from the chip
  // row. createProduct/editProduct navigate straight into ProductEdit since the natural next
  // step is filling the product in; the other three are "background" actions (per the plan)
  // that just confirm what happened in chat text, since they already fully completed.
  const runCrossProjectAction = async (action: AssistantAction) => {
    try {
      const result = await executeAssistantAction({
        type: action.type,
        projectId: action.projectId,
        productName: action.productName,
        priceUsd: action.priceUsd,
        menuLabel: action.menuLabel,
        pageName: action.pageName,
      });
      switch (action.type) {
        case 'createProduct':
          appendConfirmation(`✅ Created "${action.productName?.trim() || 'New product'}" in your catalog — opening it now so you can finish it up.`);
          navigateTo('ProductEdit', { productId: result.productId });
          onClose();
          break;
        case 'editProduct':
          appendConfirmation(`Found it — opening "${action.productName}" for editing.`);
          navigateTo('ProductEdit', { productId: result.productId });
          onClose();
          break;
        case 'insertProductOnPage':
          appendConfirmation(`✅ Added "${action.productName}" to your site. Open the editor to see it and finish placing it.`);
          break;
        case 'publishProject':
          appendConfirmation(`✅ Published! Your site is live at ${result.url}.`);
          break;
        case 'addMenuItem':
          appendConfirmation(`✅ Added "${action.menuLabel}" to your site's menu.`);
          break;
      }
    } catch (err: any) {
      appendConfirmation(`I couldn't do that: ${err?.message ?? 'something went wrong. Try again in a moment.'}`);
    }
  };

  // Dispatches one action from the assistant's reply -- either the original navigate-only
  // behavior, or (Phase 8) a real cross-project action. `messageId` is the assistant message
  // this action came from, used to key the disambiguation chip row if the project is
  // ambiguous.
  const dispatchAction = (action: AssistantAction, messageId: string) => {
    if (!CROSS_PROJECT_ACTION_TYPES.includes(action.type)) {
      navigateAction(action, onClose);
      return;
    }
    // createProduct/editProduct are account-wide (a new catalog product, or finding an
    // existing one by name) -- only the other three actually mutate a specific project.
    const needsProject = action.type !== 'editProduct' && action.type !== 'createProduct';
    if (needsProject && !action.projectId) {
      if (projects.length === 0) {
        appendConfirmation("You don't have any projects yet — create one first, then ask me again.");
        return;
      }
      if (projects.length === 1) {
        runCrossProjectAction({ ...action, projectId: projects[0].id });
        return;
      }
      setPendingActions((prev) => ({ ...prev, [messageId]: action }));
      return;
    }
    runCrossProjectAction(action);
  };

  const pickProjectForPendingAction = (messageId: string, projectId: string) => {
    const action = pendingActions[messageId];
    if (!action) return;
    setPendingActions((prev) => {
      const next = { ...prev };
      delete next[messageId];
      return next;
    });
    runCrossProjectAction({ ...action, projectId });
  };

  const pickImage = async () => {
    if (pendingImages.length >= MAX_CHAT_IMAGES) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6 });
    if (result.canceled || result.assets.length === 0) return;
    setPendingImages((prev) => [...prev, result.assets[0].uri].slice(0, MAX_CHAT_IMAGES));
  };

  const removePendingImage = (index: number) => {
    setPendingImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSend = async () => {
    const text = input.trim();
    if ((!text && pendingImages.length === 0) || sending) return;

    setSending(true);
    const imagesToUpload = pendingImages;
    setInput('');
    setPendingImages([]);

    let imageUrls: string[] = [];
    try {
      if (imagesToUpload.length > 0) {
        imageUrls = await Promise.all(imagesToUpload.map(uploadLocalImage));
      }
    } catch (err: any) {
      setSending(false);
      showAlert('Could not attach image', err?.message ?? 'Try again.');
      return;
    }

    const messageText = text || 'Take a look at this and let me know what you think, or help with what it shows.';
    const userMessage: AssistantMessage = {
      id: generateId('msg'),
      role: 'user',
      content: messageText,
      createdAt: Date.now(),
      images: imageUrls.length > 0 ? imageUrls : undefined,
    };
    const historyForModel = messages
      .slice(-HISTORY_FOR_MODEL)
      .map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, userMessage]);
    assistantMessagesStore.add(uid, userMessage).catch(() => {});

    try {
      const { reply, actions } = await sendAssistantMessage(messageText, historyForModel, currentScreenName(), imageUrls);
      const assistantMessage: AssistantMessage = {
        id: generateId('msg'),
        role: 'assistant',
        content: reply,
        createdAt: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
      assistantMessagesStore.add(uid, assistantMessage).catch(() => {});
      actions.forEach((action) => dispatchAction(action, assistantMessage.id));
    } catch (err: any) {
      showAlert('Spark couldn’t reply', err?.message ?? 'Something went wrong. Try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={[styles.flexOne, { paddingBottom: keyboardHeight }]}>
        <View style={styles.header}>
          <View style={styles.headerTitleRow}>
            <Ionicons name="sparkles" size={18} color="#4338CA" />
            <Text style={styles.title}>Spark Assistant</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={24} color="#0F172A" />
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator color="#4338CA" />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            style={styles.flexOne}
            data={messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.list}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            ListEmptyComponent={
              <Text style={styles.empty}>
                Ask me to build you a site, jump to your projects, check plans, troubleshoot a problem, or find your
                way around — anything about SiteSpark. You can attach up to {MAX_CHAT_IMAGES} photos too, like a
                screenshot of something that's not working.
              </Text>
            }
            renderItem={({ item }) => {
              const images = item.images;
              const pendingAction = pendingActions[item.id];
              return (
                <View style={[styles.bubbleRow, item.role === 'user' ? styles.bubbleRowUser : styles.bubbleRowAssistant]}>
                  <View style={{ maxWidth: '90%' }}>
                    <View style={[styles.bubble, item.role === 'user' ? styles.bubbleUser : styles.bubbleAssistant]}>
                      {images && images.length > 0 && (
                        <View style={styles.bubbleImages}>
                          {images.map((uri, index) => (
                            <Image key={index} source={{ uri }} style={styles.bubbleImage} />
                          ))}
                        </View>
                      )}
                      <Text style={item.role === 'user' ? styles.bubbleTextUser : styles.bubbleTextAssistant}>
                        {item.content}
                      </Text>
                    </View>
                    {pendingAction && (
                      <View style={styles.projectChipRow}>
                        <Text style={styles.projectChipPrompt}>Which project?</Text>
                        <View style={styles.projectChipWrap}>
                          {projects.map((p) => (
                            <Pressable
                              key={p.id}
                              style={styles.projectChip}
                              onPress={() => pickProjectForPendingAction(item.id, p.id)}
                            >
                              <Text style={styles.projectChipText} numberOfLines={1}>
                                {p.name}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                      </View>
                    )}
                  </View>
                </View>
              );
            }}
          />
        )}

        {pendingImages.length > 0 && (
          <View style={styles.pendingImagesRow}>
            {pendingImages.map((uri, index) => (
              <View key={index} style={styles.pendingImageWrap}>
                <Image source={{ uri }} style={styles.pendingImage} />
                <Pressable style={styles.pendingImageRemove} onPress={() => removePendingImage(index)} hitSlop={8}>
                  <Ionicons name="close" size={12} color="#FFFFFF" />
                </Pressable>
              </View>
            ))}
          </View>
        )}

        <View style={styles.inputRow}>
          <Pressable
            style={styles.attachButton}
            onPress={pickImage}
            disabled={pendingImages.length >= MAX_CHAT_IMAGES}
            hitSlop={6}
          >
            <Ionicons
              name="image-outline"
              size={22}
              color={pendingImages.length >= MAX_CHAT_IMAGES ? '#CBD5E1' : '#4338CA'}
            />
          </Pressable>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Message Spark..."
            placeholderTextColor="#94A3B8"
            multiline
          />
          <Pressable
            style={styles.sendButton}
            onPress={handleSend}
            disabled={sending || (!input.trim() && pendingImages.length === 0)}
          >
            {sending ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Ionicons name="arrow-up" size={18} color="#FFFFFF" />
            )}
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  flexOne: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16, gap: 10, flexGrow: 1 },
  empty: { fontSize: 13, color: '#94A3B8', textAlign: 'center', marginTop: 40, lineHeight: 19 },
  bubbleRow: { flexDirection: 'row' },
  bubbleRowUser: { justifyContent: 'flex-end' },
  bubbleRowAssistant: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '80%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleUser: { backgroundColor: '#4338CA', borderBottomRightRadius: 4 },
  bubbleAssistant: { backgroundColor: '#F1F5F9', borderBottomLeftRadius: 4 },
  bubbleTextUser: { color: '#FFFFFF', fontSize: 14, lineHeight: 20 },
  projectChipRow: { marginTop: 6, paddingHorizontal: 2 },
  projectChipPrompt: { fontSize: 12, color: '#64748B', marginBottom: 6 },
  projectChipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  projectChip: {
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    maxWidth: 220,
  },
  projectChipText: { color: '#4338CA', fontSize: 13, fontWeight: '700' },
  bubbleTextAssistant: { color: '#0F172A', fontSize: 14, lineHeight: 20 },
  bubbleImages: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  bubbleImage: { width: 90, height: 90, borderRadius: 10, backgroundColor: '#E2E8F0' },
  pendingImagesRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  pendingImageWrap: { position: 'relative' },
  pendingImage: { width: 52, height: 52, borderRadius: 10, backgroundColor: '#E2E8F0' },
  pendingImageRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#0F172ACC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachButton: { paddingBottom: 8 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    maxHeight: 100,
    color: '#0F172A',
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#4338CA',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
