import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, StyleSheet, Pressable, Modal, AppState, AppStateStatus, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/hooks/useTheme';
import { Spacing, BorderRadius } from '@/constants/theme';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/contexts/NotificationContext';
import { PeekSignalDetector } from '@/utils/shoulderSurfing/detector';
import {
  getPeekDetectionEnabled,
  getPeekCooldownSeconds,
  subscribePeekSettingsChanged,
  PEEK_DIM_DURATION_MS,
} from '@/utils/shoulderSurfing/settings';

const SAMPLE_INTERVAL_MS = 2500;

// Lazily imported: @react-native-ml-kit/face-detection is a native module
// with no web implementation. Importing it unconditionally would crash the
// web build at bundle-load time, so it's only required on native platforms
// where it's actually used (see runDetection below).
let FaceDetectionModule: typeof import('@react-native-ml-kit/face-detection').default | null = null;
function getFaceDetection() {
  if (Platform.OS === 'web') return null;
  if (FaceDetectionModule) return FaceDetectionModule;
  try {
    FaceDetectionModule = require('@react-native-ml-kit/face-detection').default;
    return FaceDetectionModule;
  } catch {
    return null;
  }
}

// See client/utils/shoulderSurfing/detector.ts — this now runs real
// on-device face detection (Google ML Kit) on each captured frame, not a
// heuristic proxy. Web has no ML Kit binding, so it falls back to the
// byte-size heuristic there only; iOS/Android get genuine face-count
// detection. This component owns the full lifecycle around that signal:
// only running the camera while it's actually useful (feature on,
// permission granted, app foregrounded, a conversation open), asking the
// user, dimming on "yes", and enforcing the cooldown either way so the
// alert can't spam the user.
export function ShoulderSurfingGuard() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { activeConversationId } = useNotifications();
  const [permission] = useCameraPermissions();
  const [featureEnabled, setFeatureEnabled] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(60);
  const [alertVisible, setAlertVisible] = useState(false);
  const [dimmed, setDimmed] = useState(false);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  // Small persistent status pill, separate from the blocking modal below —
  // stays up for as long as the peek condition is actively being detected
  // (armed the instant a sample crosses the threshold, cleared once the
  // user responds), so there's always a lightweight, glanceable signal even
  // if they dismiss or ignore the modal.
  const [peekBannerVisible, setPeekBannerVisible] = useState(false);

  const cameraRef = useRef<CameraView | null>(null);
  const detectorRef = useRef(new PeekSignalDetector());
  const sampleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cooldownUntilRef = useRef<number>(0);
  const capturingRef = useRef(false);

  // Load local settings once, then react live to changes made from the
  // Peek Detection settings screen without needing a remount.
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const [enabled, cooldown] = await Promise.all([getPeekDetectionEnabled(), getPeekCooldownSeconds()]);
      if (!mounted) return;
      setFeatureEnabled(enabled);
      setCooldownSeconds(cooldown);
    };
    load();
    const unsubscribe = subscribePeekSettingsChanged(load);
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      setAppActive(state === 'active');
    });
    return () => sub.remove();
  }, []);

  const armCooldown = useCallback(() => {
    cooldownUntilRef.current = Date.now() + cooldownSeconds * 1000;
  }, [cooldownSeconds]);

  const dismissAlert = useCallback(
    (hide: boolean) => {
      setAlertVisible(false);
      setPeekBannerVisible(false);
      detectorRef.current.reset();
      armCooldown();
      if (hide) {
        setDimmed(true);
        if (dimTimerRef.current) clearTimeout(dimTimerRef.current);
        dimTimerRef.current = setTimeout(() => setDimmed(false), PEEK_DIM_DURATION_MS);
      }
    },
    [armCooldown],
  );

  const shouldRun = !!user && featureEnabled && appActive && !!activeConversationId;
  const cameraGranted = permission?.granted === true;
  const active = shouldRun && cameraGranted;

  useEffect(() => {
    if (!active) {
      if (sampleTimerRef.current) {
        clearInterval(sampleTimerRef.current);
        sampleTimerRef.current = null;
      }
      detectorRef.current.reset();
      return;
    }

    sampleTimerRef.current = setInterval(async () => {
      if (capturingRef.current) return;
      if (Date.now() < cooldownUntilRef.current) return;
      if (alertVisible || dimmed) return;
      const cam = cameraRef.current;
      if (!cam) return;

      capturingRef.current = true;
      try {
        const FaceDetection = getFaceDetection();
        if (FaceDetection) {
          // Native path: real face-count detection. Capture to a temp file
          // (uri) rather than base64 — ML Kit's detect() takes a file URI.
          const photo = await cam.takePictureAsync({ quality: 0.3, skipProcessing: true });
          if (photo?.uri) {
            const faces = await FaceDetection.detect(photo.uri, { performanceMode: 'fast' });
            const triggered = detectorRef.current.addSample(Array.isArray(faces) ? faces.length : 0);
            if (triggered) { setAlertVisible(true); setPeekBannerVisible(true); }
          }
        } else {
          // Web fallback: no ML Kit binding, use the byte-size heuristic.
          const photo = await cam.takePictureAsync({ quality: 0, base64: true, skipProcessing: true });
          const rawB64 = photo?.base64;
          const b64 = rawB64?.startsWith('data:') ? rawB64.slice(rawB64.indexOf(',') + 1) : rawB64;
          if (b64) {
            // A single elevated byte-length reading isn't face-aware, so
            // require the same sample to look "elevated" relative to a
            // fixed floor rather than feeding raw length into a face-count
            // detector — reuse the count-based detector by mapping a big
            // jump to "2 faces", anything normal to "1".
            const elevated = b64.length > 15000; // ~ typical single-face front-cam JPEG at quality 0
            const triggered = detectorRef.current.addSample(elevated ? 2 : 1);
            if (triggered) { setAlertVisible(true); setPeekBannerVisible(true); }
          }
        }
      } catch {
        // Camera not ready / detection failure — just skip this tick.
      } finally {
        capturingRef.current = false;
      }
    }, SAMPLE_INTERVAL_MS);

    return () => {
      if (sampleTimerRef.current) {
        clearInterval(sampleTimerRef.current);
        sampleTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, alertVisible, dimmed]);

  useEffect(() => {
    return () => {
      if (dimTimerRef.current) clearTimeout(dimTimerRef.current);
      if (sampleTimerRef.current) clearInterval(sampleTimerRef.current);
    };
  }, []);

  return (
    <>
      {active ? (
        <View style={styles.hiddenCameraWrap} pointerEvents="none">
          <CameraView ref={cameraRef} style={styles.hiddenCamera} facing="front" />
        </View>
      ) : null}

      {peekBannerVisible ? (
        <View style={[styles.peekBanner, { top: insets.top + Spacing.sm }]} pointerEvents="box-none">
          <View style={[styles.peekBannerPill, { backgroundColor: theme.warning }]}>
            <Feather name="eye" size={14} color="#1a1200" />
            <ThemedText type="small" style={styles.peekBannerText}>
              Someone may be looking at your screen
            </ThemedText>
          </View>
        </View>
      ) : null}

      <Modal visible={dimmed} transparent animationType="none" statusBarTranslucent onRequestClose={() => setDimmed(false)}>
        <Pressable style={styles.dimOverlay} onPress={() => setDimmed(false)}>
          <View style={styles.dimContent}>
            <Feather name="eye-off" size={28} color="#FFFFFF" />
            <ThemedText type="small" style={{ color: '#FFFFFF', marginTop: Spacing.sm, opacity: 0.85 }}>
              Chat hidden — tap to reveal
            </ThemedText>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={alertVisible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => dismissAlert(false)}>
        <View style={styles.overlay}>
          <View style={[styles.card, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}>
            <View style={[styles.iconWrap, { backgroundColor: theme.warning + '18' }]}>
              <Feather name="eye" size={26} color={theme.warning} />
            </View>
            <ThemedText type="h4" style={{ textAlign: 'center', marginTop: Spacing.md }}>
              Somebody is peeking
            </ThemedText>
            <ThemedText type="body" style={{ color: theme.textSecondary, textAlign: 'center', marginTop: Spacing.sm }}>
              Do you want to hide the chat?
            </ThemedText>

            <Pressable
              onPress={() => dismissAlert(true)}
              style={({ pressed }) => [styles.primaryBtn, { backgroundColor: theme.primary, opacity: pressed ? 0.8 : 1 }]}
            >
              <ThemedText type="body" style={{ color: '#fff', fontWeight: '700' }}>Yes, hide it</ThemedText>
            </Pressable>
            <Pressable
              onPress={() => dismissAlert(false)}
              style={({ pressed }) => [styles.secondaryBtn, { opacity: pressed ? 0.6 : 1 }]}
            >
              <ThemedText type="body" style={{ color: theme.textSecondary, fontWeight: '600' }}>No, keep it visible</ThemedText>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  hiddenCameraWrap: {
    position: 'absolute',
    top: -2000,
    left: -2000,
    width: 2,
    height: 2,
    opacity: 0,
  },
  hiddenCamera: {
    width: 2,
    height: 2,
  },
  peekBanner: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9998,
    elevation: 9998,
  },
  peekBannerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  peekBannerText: {
    color: '#1a1200',
    fontWeight: '700',
  },
  dimOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    elevation: 9999,
  },
  dimContent: {
    alignItems: 'center',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.xl,
    alignItems: 'center',
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtn: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.xl,
  },
  secondaryBtn: {
    width: '100%',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.sm,
  },
});
