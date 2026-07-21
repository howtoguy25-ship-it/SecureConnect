import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { showAlert } from '@/utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/types';
import { suggestClarifyingQuestions, startGeneration } from '@/services/aiBuilder';
import { generateId } from '@/utils/id';

type Props = NativeStackScreenProps<RootStackParamList, 'AIClarify'>;

// Sits between AIPromptScreen and the real (paid) build: a free round of AI-generated
// questions specific to what the user actually typed (see suggestClarifyingQuestions),
// e.g. "build me a basketball site" gets asked about team name/colors/whether to sell
// merch, instead of the AI silently guessing at missing details. Answering is optional --
// if the question fetch fails for any reason, this step gets out of the way entirely
// rather than blocking the build the user is paying credits for.
export default function AIClarifyScreen({ navigation, route }: Props) {
  const { pageType, prompt, complexity, referenceImages } = route.params;
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    suggestClarifyingQuestions(prompt, pageType)
      .then((qs) => {
        if (cancelled) return;
        setQuestions(qs);
        setAnswers(qs.map(() => ''));
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [prompt, pageType]);

  const beginBuild = async (finalPrompt: string) => {
    setStarting(true);
    const sessionId = generateId('session');
    const call = startGeneration({ sessionId, prompt: finalPrompt, pageType, complexity, referenceImages });

    // The server's credit check throws immediately (before the real generation work even
    // starts), so racing a short timeout against the call catches that rejection without
    // making every build wait -- if nothing comes back quickly, the check passed and
    // generation is under way; the progress screen takes over from its own Firestore
    // subscription from here, with `call` still running in the background toward its
    // eventual resolution.
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
        showAlert('Could not start build', err?.message ?? 'Something went wrong.');
      }
      return;
    }

    navigation.navigate('AIBuildProgress', { sessionId, pageType, prompt: finalPrompt, complexity });
  };

  const handleStartWithAnswers = () => {
    const answered = questions.map((q, i) => ({ q, a: answers[i]?.trim() })).filter((pair) => pair.a);
    if (answered.length === 0) {
      beginBuild(prompt);
      return;
    }
    const extra = answered.map(({ q, a }) => `- ${q} ${a}`).join('\n');
    beginBuild(`${prompt}\n\nAdditional details from the user:\n${extra}`);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <ActivityIndicator color="#4338CA" />
          <Text style={styles.loadingText}>Thinking of a few good questions...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const hasQuestions = !loadFailed && questions.length > 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} disabled={starting}>
          <Ionicons name="chevron-back" size={26} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>Quick questions</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {hasQuestions ? (
          <>
            <Text style={styles.subtitle}>
              A few quick answers help the AI build something closer to what you actually want — all optional, skip anything you
              don't care about.
            </Text>
            {questions.map((q, i) => (
              <View key={i} style={styles.questionBlock}>
                <Text style={styles.questionText}>{q}</Text>
                <TextInput
                  style={styles.answerInput}
                  value={answers[i]}
                  onChangeText={(text) => setAnswers((prev) => prev.map((a, idx) => (idx === i ? text : a)))}
                  placeholder="Your answer (optional)"
                  placeholderTextColor="#94A3B8"
                  multiline
                />
              </View>
            ))}
          </>
        ) : (
          <Text style={styles.subtitle}>
            Couldn't come up with follow-up questions this time — no problem, we'll build straight from what you already wrote.
          </Text>
        )}

        <Pressable style={styles.startButton} onPress={handleStartWithAnswers} disabled={starting}>
          {starting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="sparkles" size={18} color="#FFFFFF" />
              <Text style={styles.startButtonText}>Start Building</Text>
            </>
          )}
        </Pressable>
        {hasQuestions && (
          <Pressable style={styles.skipButton} onPress={() => beginBuild(prompt)} disabled={starting}>
            <Text style={styles.skipButtonText}>Skip, just build it</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 14, color: '#64748B' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
  title: { fontSize: 17, fontWeight: '700', color: '#0F172A' },
  content: { padding: 20 },
  subtitle: { fontSize: 14, color: '#64748B', lineHeight: 20, marginBottom: 18 },
  questionBlock: { marginBottom: 18 },
  questionText: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 8 },
  answerInput: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    minHeight: 44,
    color: '#0F172A',
    textAlignVertical: 'top',
  },
  startButton: {
    marginTop: 8,
    backgroundColor: '#4338CA',
    borderRadius: 12,
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  startButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  skipButton: { marginTop: 14, alignItems: 'center' },
  skipButtonText: { color: '#94A3B8', fontWeight: '600', fontSize: 13 },
});
