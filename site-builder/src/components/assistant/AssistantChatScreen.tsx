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
import { sendAssistantMessage } from '@/services/assistant';
import { uploadLocalImage } from '@/services/uploads';
import { navigateTo, currentScreenName } from '@/navigation/navigationRef';
import { generateId } from '@/utils/id';
import { AssistantAction, AssistantMessage, PageType } from '@/types';

interface Props {
  onClose: () => void;
}

const HISTORY_FOR_MODEL = 20;

function runAction(action: AssistantAction, onClose: () => void) {
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
      actions.forEach((action) => runAction(action, onClose));
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
              return (
                <View style={[styles.bubbleRow, item.role === 'user' ? styles.bubbleRowUser : styles.bubbleRowAssistant]}>
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
