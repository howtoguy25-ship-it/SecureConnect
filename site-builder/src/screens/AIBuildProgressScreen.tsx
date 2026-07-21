import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Modal,
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

  useEffect(() => {
    const unsubscribe = generationSessionStore.subscribe(uid, sessionId, setSession);
    return unsubscribe;
  }, [uid, sessionId]);

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

  if (!session) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <ActivityIndicator color="#4338CA" />
        </View>
      </SafeAreaView>
    );
  }

  const isPaused = session.status === 'paused';
  const isError = session.status === 'error' || session.status === 'cancelled';
  const pausesLeft = MAX_PAUSES - session.pausesUsed;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Ionicons name="sparkles" size={22} color="#4338CA" />
        <Text style={styles.title}>Building your site</Text>
      </View>

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
            <Text style={styles.metricValue}>{session.minutesElapsed.toFixed(1)}</Text>
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
