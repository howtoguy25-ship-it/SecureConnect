import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { assistantMessagesStore } from '@/storage/assistantMessagesStore';
import { sendAssistantMessage } from '@/services/assistant';
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

export default function AssistantChatScreen({ onClose }: Props) {
  const { user } = useAuth();
  const uid = user!.uid;
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    assistantMessagesStore.list(uid).then((history) => {
      setMessages(history);
      setLoading(false);
    });
  }, [uid]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;

    const userMessage: AssistantMessage = { id: generateId('msg'), role: 'user', content: text, createdAt: Date.now() };
    const historyForModel = messages
      .slice(-HISTORY_FOR_MODEL)
      .map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setSending(true);
    assistantMessagesStore.add(uid, userMessage).catch(() => {});

    try {
      const { reply, actions } = await sendAssistantMessage(text, historyForModel, currentScreenName());
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
      Alert.alert('Spark couldn’t reply', err?.message ?? 'Something went wrong. Try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
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
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={
            <Text style={styles.empty}>
              Ask me to build you a site, jump to your projects, check plans — anything about SiteSpark.
            </Text>
          }
          renderItem={({ item }) => (
            <View style={[styles.bubbleRow, item.role === 'user' ? styles.bubbleRowUser : styles.bubbleRowAssistant]}>
              <View style={[styles.bubble, item.role === 'user' ? styles.bubbleUser : styles.bubbleAssistant]}>
                <Text style={item.role === 'user' ? styles.bubbleTextUser : styles.bubbleTextAssistant}>
                  {item.content}
                </Text>
              </View>
            </View>
          )}
        />
      )}

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Message Spark..."
            placeholderTextColor="#94A3B8"
            multiline
          />
          <Pressable style={styles.sendButton} onPress={handleSend} disabled={sending || !input.trim()}>
            {sending ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Ionicons name="arrow-up" size={18} color="#FFFFFF" />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
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
