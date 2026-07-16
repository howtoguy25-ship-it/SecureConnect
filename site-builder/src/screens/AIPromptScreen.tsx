import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/types';
import { useAuth } from '@/context/AuthContext';
import { userAccountStore } from '@/storage/userAccountStore';
import { startGeneration } from '@/services/aiBuilder';
import { computeBuildCost } from '@/data/pricing';
import { COMPLEXITY_INFO, BuildComplexity } from '@/data/pricing';
import { generateId } from '@/utils/id';
import { PAGE_TYPE_INFO } from '@/data/canvasSizes';
import { UserAccount } from '@/types';

type Props = NativeStackScreenProps<RootStackParamList, 'AIPrompt'>;

const MAX_WORDS = 4000;
const COMPLEXITIES: BuildComplexity[] = ['simple', 'standard', 'crazy'];

function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export default function AIPromptScreen({ navigation, route }: Props) {
  const { pageType } = route.params;
  const { user } = useAuth();
  const uid = user!.uid;
  const [prompt, setPrompt] = useState('');
  const [complexity, setComplexity] = useState<BuildComplexity>('standard');
  const [account, setAccount] = useState<UserAccount | null>(null);

  useEffect(() => {
    userAccountStore.get(uid).then(setAccount);
  }, [uid]);

  const words = wordCount(prompt);
  const overLimit = words > MAX_WORDS;
  const estimatedCost = account ? computeBuildCost(account.plan, complexity) : null;
  const insufficientCredits = account != null && estimatedCost != null && account.credits < estimatedCost;

  const [starting, setStarting] = useState(false);

  const handleStart = async () => {
    if (!prompt.trim()) {
      Alert.alert('Add a prompt', 'Describe the site you want built first.');
      return;
    }
    if (overLimit) {
      Alert.alert('Prompt too long', `Keep it under ${MAX_WORDS} words.`);
      return;
    }
    if (insufficientCredits) {
      navigation.navigate('Subscription');
      return;
    }

    setStarting(true);
    const sessionId = generateId('session');
    const call = startGeneration({ sessionId, prompt: prompt.trim(), pageType, complexity });

    // The server's credit check throws immediately (before the ~1-2 min generation
    // work even starts), so racing a short timeout against the call catches that
    // rejection without making every build wait -- if nothing comes back quickly, the
    // check passed and generation is under way; the progress screen takes over from
    // its own Firestore subscription from here, with `call` still running in the
    // background toward its eventual resolution.
    const settledCall = call.then(
      (value) => ({ type: 'resolved' as const, value }),
      (error) => ({ type: 'rejected' as const, error })
    );
    const quickResult = await Promise.race([
      settledCall,
      new Promise<{ type: 'pending' }>((resolve) => setTimeout(() => resolve({ type: 'pending' }), 2500)),
    ]);
    call.catch(() => {});
    setStarting(false);

    if (quickResult.type === 'rejected') {
      const err = quickResult.error;
      if (err?.code === 'functions/resource-exhausted') {
        navigation.navigate('Subscription');
      } else {
        Alert.alert('Could not start build', err?.message ?? 'Something went wrong.');
      }
      return;
    }

    navigation.navigate('AIBuildProgress', { sessionId, pageType, prompt: prompt.trim(), complexity });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={26} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>AI Site Builder</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.label}>Describe your dream {PAGE_TYPE_INFO[pageType].title.toLowerCase()}</Text>
        <TextInput
          style={styles.textarea}
          value={prompt}
          onChangeText={setPrompt}
          multiline
          placeholder="e.g. A warm, modern site for my coffee roasting business — earthy tones, a hero section with our story, a menu of our beans, and a contact section..."
          textAlignVertical="top"
        />
        <Text style={[styles.wordCount, overLimit && styles.wordCountOver]}>
          {words} / {MAX_WORDS} words
        </Text>

        <Text style={styles.label}>How much detail?</Text>
        <View style={styles.complexityRow}>
          {COMPLEXITIES.map((c) => (
            <Pressable
              key={c}
              style={[styles.complexityCard, complexity === c && styles.complexityCardActive]}
              onPress={() => setComplexity(c)}
            >
              <Text style={[styles.complexityLabel, complexity === c && styles.complexityLabelActive]}>
                {COMPLEXITY_INFO[c].label}
              </Text>
              <Text style={styles.complexityDesc}>{COMPLEXITY_INFO[c].description}</Text>
            </Pressable>
          ))}
        </View>

        {estimatedCost != null && (
          <View style={styles.costRow}>
            <Ionicons name="flash-outline" size={16} color="#B45309" />
            <Text style={styles.costText}>
              Estimated cost: {estimatedCost} credits {account && `(you have ${account.credits})`}
            </Text>
          </View>
        )}

        <Pressable style={styles.generateButton} onPress={handleStart} disabled={starting}>
          {starting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="sparkles" size={18} color="#FFFFFF" />
              <Text style={styles.generateButtonText}>Generate My Site</Text>
            </>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
  title: { fontSize: 17, fontWeight: '700', color: '#0F172A' },
  content: { padding: 20 },
  label: { fontSize: 14, fontWeight: '700', color: '#0F172A', marginTop: 16, marginBottom: 8 },
  textarea: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    minHeight: 160,
    color: '#0F172A',
  },
  wordCount: { fontSize: 12, color: '#94A3B8', marginTop: 6, textAlign: 'right' },
  wordCountOver: { color: '#DC2626', fontWeight: '700' },
  complexityRow: { gap: 10 },
  complexityCard: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 14,
  },
  complexityCardActive: { borderColor: '#4338CA', backgroundColor: '#EEF2FF' },
  complexityLabel: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  complexityLabelActive: { color: '#4338CA' },
  complexityDesc: { fontSize: 12, color: '#64748B', marginTop: 4 },
  costRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 18 },
  costText: { fontSize: 13, color: '#B45309', fontWeight: '600' },
  generateButton: {
    marginTop: 24,
    backgroundColor: '#4338CA',
    borderRadius: 12,
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  generateButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
});
