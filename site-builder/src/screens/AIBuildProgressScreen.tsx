import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Modal,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { showAlert } from '@/utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/types';
import { useAuth } from '@/context/AuthContext';
import { generationSessionStore } from '@/storage/generationSessionStore';
import { requestPause, resumeGeneration, cancelGeneration } from '@/services/aiBuilder';
import { GenerationSession } from '@/types';
import BuildStepTracker from '@/components/BuildStepTracker';
import LivePreviewCanvas from '@/components/LivePreviewCanvas';

type Props = NativeStackScreenProps<RootStackParamList, 'AIBuildProgress'>;

const MAX_PAUSES = 2;

export default function AIBuildProgressScreen({ navigation, route }: Props) {
  const { sessionId } = route.params;
  const { user } = useAuth();
  const uid = user!.uid;
  const [session, setSession] = useState<GenerationSession | null>(null);
  const [pauseMessage, setPauseMessage] = useState('');
  const [requestingPause, setRequestingPause] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const navigatedRef = useRef(false);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isWide = windowWidth >= 700;
  // Much bigger than the old fixed 320x420 cap -- the live preview is the main thing to
  // look at while a build runs, so it should read as the dominant element on screen (most
  // of the available width in portrait, a large fixed pane alongside the status card on
  // wide/tablet layouts) instead of a small thumbnail off to the side.
  const previewMaxWidth = isWide ? 380 : windowWidth - 32;
  const previewMaxHeight = isWide ? 640 : Math.round(windowHeight * 0.56);
  // The server only writes a final minutesElapsed once, at completion/error -- ticking a
  // real clock client-side (from the session's own createdAt) is what makes the "minutes"
  // metric actually count up live while a build is running, instead of sitting at 0.0 the
  // whole time.
  const [nowTick, setNowTick] = useState(Date.now());

  useEffect(() => {
    const unsubscribe = generationSessionStore.subscribe(uid, sessionId, setSession);
    return unsubscribe;
  }, [uid, sessionId]);

  useEffect(() => {
    if (!session) return;
    const isRunning = session.status === 'starting' || session.status === 'generating' || session.status === 'paused';
    if (!isRunning) return;
    const interval = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [session?.status]);

  useEffect(() => {
    if (!session || navigatedRef.current) return;
    if (session.status === 'completed' && session.resultProjectId) {
      navigatedRef.current = true;
      navigation.replace('Editor', { projectId: session.resultProjectId });
    }
  }, [session, navigation]);

  const handlePause = async () => {
    setRequestingPause(true);
    try {
      await requestPause(sessionId);
    } catch (err: any) {
      showAlert('Could not pause', err?.message ?? 'Try again in a moment.');
    } finally {
      setRequestingPause(false);
    }
  };

  const handleResume = async () => {
    try {
      await resumeGeneration(sessionId, pauseMessage);
      setPauseMessage('');
    } catch (err: any) {
      showAlert('Could not continue', err?.message ?? 'Try again.');
    }
  };

  const handleCancel = () => {
    showAlert('Cancel this build?', 'Your credits for this build will be refunded.', [
      { text: 'Keep building', style: 'cancel' },
      {
        text: 'Cancel & refund',
        style: 'destructive',
        onPress: async () => {
          setCancelling(true);
          try {
            await cancelGeneration(sessionId);
          } catch (err: any) {
            setCancelling(false);
            showAlert('Could not cancel', err?.message ?? 'Try again in a moment.');
          }
        },
      },
    ]);
  };

  const handleBack = () => {
    if (session && session.status !== 'completed' && session.status !== 'error' && session.status !== 'cancelled') {
      showAlert(
        'Leave this screen?',
        'Your build keeps going in the background -- you can check back on it anytime from Projects.',
        [
          { text: 'Keep watching', style: 'cancel' },
          { text: 'Leave', onPress: () => navigation.goBack() },
        ]
      );
      return;
    }
    navigation.goBack();
  };

  if (!session) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color="#0F172A" />
          </Pressable>
          <Ionicons name="sparkles" size={22} color="#4338CA" />
          <Text style={styles.title}>Building your site</Text>
        </View>
        <View style={styles.centered}>
          <ActivityIndicator color="#4338CA" />
        </View>
      </SafeAreaView>
    );
  }

  const isPaused = session.status === 'paused';
  const isError = session.status === 'error' || session.status === 'cancelled';
  const pausesLeft = MAX_PAUSES - session.pausesUsed;
  const isRunning = session.status === 'starting' || session.status === 'generating' || session.status === 'paused';
  const displayMinutes = isRunning ? (nowTick - session.createdAt) / 60000 : session.minutesElapsed;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={handleBack} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color="#0F172A" />
        </Pressable>
        <Ionicons name="sparkles" size={22} color="#4338CA" />
        <Text style={styles.title}>Building your site</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, isWide && styles.bodyWide]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.previewWrap, isWide && styles.previewWrapWide]}>
          <LivePreviewCanvas
            uid={uid}
            projectId={session.previewProjectId}
            maxWidth={previewMaxWidth}
            maxHeight={previewMaxHeight}
          />
          <Text style={styles.previewLabel}>Live preview -- updates as it's built</Text>
        </View>

        <View style={styles.mainColumn}>
          <View style={styles.card}>
            {!isError && (
              <BuildStepTracker statusMessage={session.statusMessage} completed={session.status === 'completed'} />
            )}
            {isError && (
              <View style={styles.spinnerRow}>
                <Ionicons name="alert-circle" size={20} color="#DC2626" />
                <Text style={[styles.statusMessage, { color: '#DC2626' }]}>{session.errorMessage ?? 'Something went wrong.'}</Text>
              </View>
            )}

            <View style={styles.metricsRow}>
              <View style={styles.metric}>
                <Text style={styles.metricValue}>{displayMinutes.toFixed(1)}</Text>
                <Text style={styles.metricLabel}>minutes</Text>
              </View>
              <View style={styles.metric}>
                <Text style={styles.metricValue}>{session.creditsUsed}</Text>
                <Text style={styles.metricLabel}>credits used</Text>
              </View>
              <View style={styles.metric}>
                <Text style={styles.metricValue}>{pausesLeft}</Text>
                <Text style={styles.metricLabel}>pauses left</Text>
              </View>
            </View>
          </View>

          {!isPaused && !isError && session.status !== 'completed' && (
            <Pressable
              style={[styles.pauseButton, pausesLeft <= 0 && styles.pauseButtonDisabled]}
              onPress={handlePause}
              disabled={pausesLeft <= 0 || requestingPause}
            >
              {requestingPause ? (
                <ActivityIndicator color="#4338CA" />
              ) : (
                <>
                  <Ionicons name="pause-circle-outline" size={18} color={pausesLeft <= 0 ? '#94A3B8' : '#4338CA'} />
                  <Text style={[styles.pauseButtonText, pausesLeft <= 0 && { color: '#94A3B8' }]}>
                    Pause to add something ({pausesLeft} left)
                  </Text>
                </>
              )}
            </Pressable>
          )}

          {!isPaused && !isError && session.status !== 'completed' && (
            <Pressable style={styles.cancelButton} onPress={handleCancel} disabled={cancelling}>
              {cancelling ? (
                <ActivityIndicator color="#DC2626" />
              ) : (
                <>
                  <Ionicons name="close-circle-outline" size={18} color="#DC2626" />
                  <Text style={styles.cancelButtonText}>Cancel & refund credits</Text>
                </>
              )}
            </Pressable>
          )}

          {isError && (
            <Pressable style={styles.pauseButton} onPress={() => navigation.goBack()}>
              <Text style={styles.pauseButtonText}>Back</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>

      <Modal visible={isPaused} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add something before continuing</Text>
            <Text style={styles.modalBody}>
              Ask a question about this build, or tell the AI something extra to add. This uses one of your {MAX_PAUSES} pauses.
            </Text>
            <TextInput
              style={styles.modalInput}
              value={pauseMessage}
              onChangeText={setPauseMessage}
              placeholder="e.g. Make the hero section more colorful"
              multiline
            />
            <Pressable style={styles.modalButton} onPress={handleResume}>
              <Text style={styles.modalButtonText}>Continue Building</Text>
            </Pressable>
            <Pressable style={styles.modalSkip} onPress={() => { setPauseMessage(''); handleResume(); }}>
              <Text style={styles.modalSkipText}>Never mind, just continue</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingTop: 20 },
  title: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  body: { flexGrow: 1 },
  bodyWide: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 20, gap: 20 },
  previewWrap: { alignItems: 'center', marginTop: 8 },
  previewWrapWide: { marginTop: 20, flexShrink: 0 },
  previewLabel: { fontSize: 11, color: '#94A3B8', fontWeight: '600', marginTop: 8 },
  mainColumn: { flex: 1 },
  card: {
    margin: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  spinnerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statusMessage: { flex: 1, fontSize: 14, color: '#334155', fontWeight: '600' },
  metricsRow: { flexDirection: 'row', marginTop: 24, justifyContent: 'space-between' },
  metric: { alignItems: 'center' },
  metricValue: { fontSize: 22, fontWeight: '800', color: '#4338CA' },
  metricLabel: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  pauseButton: {
    marginHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    borderRadius: 12,
    height: 48,
  },
  pauseButtonDisabled: { borderColor: '#E2E8F0' },
  pauseButtonText: { color: '#4338CA', fontWeight: '700', fontSize: 14 },
  cancelButton: {
    marginHorizontal: 20,
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
  },
  cancelButtonText: { color: '#DC2626', fontWeight: '600', fontSize: 13 },
  modalBackdrop: { flex: 1, backgroundColor: '#00000088', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { width: '100%', backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#0F172A' },
  modalBody: { fontSize: 13, color: '#64748B', marginTop: 8, lineHeight: 19 },
  modalInput: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 12,
    minHeight: 80,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  modalButton: { marginTop: 16, backgroundColor: '#4338CA', borderRadius: 10, height: 48, alignItems: 'center', justifyContent: 'center' },
  modalButtonText: { color: '#FFFFFF', fontWeight: '700' },
  modalSkip: { marginTop: 12, alignItems: 'center' },
  modalSkipText: { color: '#94A3B8', fontSize: 13, fontWeight: '600' },
});
