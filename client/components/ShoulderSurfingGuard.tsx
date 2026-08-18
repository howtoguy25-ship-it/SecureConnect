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
import { PeekSignalDetector, type PeekPosition } from '@/utils/shoulderSurfing/detector';
import {
  getPeekDetectionEnabled,
  getPeekCooldownSeconds,
  subscribePeekSettingsChanged,
  PEEK_DIM_DURATION_MS,
} from '@/utils/shoulderSurfing/settings';

const SAMPLE_INTERVAL_MS = 2500;

// A fast, deliberate turn of the phone — e.g. rotating it toward a friend
// to show them something — reads as a sharp spike in angular velocity.
// Someone quietly leaning in to peek over your shoulder involves no such
// motion; the phone stays still in your hand. So a spike here is used as a
// "the owner is intentionally sharing the screen" signal that suppresses
// alerts for a short window, rather than trying to guess intent from the
// camera image itself.
const ROTATION_TRIGGER_RAD_PER_S = 2.2;
const ROTATION_SUPPRESS_MS = 4000;

// Lazily imported: expo-sensors' Gyroscope has no reliable web
// implementation (see the library's own docs), so it's only wired up on
// native, same pattern as the face-detection module below.
let GyroscopeModule: typeof import('expo-sensors').Gyroscope | null = null;
function getGyroscope() {
  if (Platform.OS === 'web') return null;
  if (GyroscopeModule) return GyroscopeModule;
  try {
    GyroscopeModule = require('expo-sensors').Gyroscope;
    return GyroscopeModule;
  } catch {
    return null;
  }
}

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

// Given the faces ML Kit found in one frame, work out where the second
// (non-owner) face sits relative to the owner's, in a form a human would
// recognize ("from your left" / "from your right" / "from above").
//
// The owner's face is assumed to be the largest one (closest to the
// camera). `takePictureAsync({ skipProcessing: true })` returns the raw
// sensor frame with no orientation/mirroring adjustment — a front camera's
// raw capture is a "photo" of the owner, not a mirror reflection, so a
// second face that lands on the LEFT side of the raw image is actually
// standing to the owner's RIGHT (and vice versa). The horizontal sign is
// flipped below to correct for that.
function computePeekPosition(
  faces: Array<{ frame: { left: number; top: number; width: number; height: number } }>,
  imageWidth: number,
  imageHeight: number,
): PeekPosition {
  if (faces.length < 2 || !imageWidth || !imageHeight) return null;
  const sorted = [...faces].sort((a, b) => b.frame.width * b.frame.height - a.frame.width * a.frame.height);
  const owner = sorted[0].frame;
  const other = sorted[1].frame;
  const ownerCenterX = owner.left + owner.width / 2;
  const ownerCenterY = owner.top + owner.height / 2;
  const otherCenterX = other.left + other.width / 2;
  const otherCenterY = other.top + other.height / 2;

  const dxRaw = (otherCenterX - ownerCenterX) / imageWidth;
  const dy = (otherCenterY - ownerCenterY) / imageHeight;
  const dx = -dxRaw; // correct raw-image left/right into the owner's own perspective

  // A face noticeably higher in frame than the owner's (peeking over the
  // top, e.g. someone taller standing behind) takes priority over a small
  // horizontal offset; otherwise classify by which side it's on.
  if (dy < -0.12 && Math.abs(dy) > Math.abs(dx)) return 'above';
  return dx < 0 ? 'left' : 'right';
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
  const [permission, , getCameraPermission] = useCameraPermissions();
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
  const [peekPosition, setPeekPosition] = useState<PeekPosition>(null);

  const cameraRef = useRef<CameraView | null>(null);
  const detectorRef = useRef(new PeekSignalDetector());
  const sampleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cooldownUntilRef = useRef<number>(0);
  const capturingRef = useRef(false);
  const rotationSuppressUntilRef = useRef<number>(0);

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
      // This component stays mounted for the app's entire lifetime, so its
      // `permission` snapshot is otherwise only ever fetched once at first
      // mount. If the user revokes camera access from device Settings
      // (which backgrounds this app) and comes back, re-check for real
      // instead of continuing to trust a stale "granted" — the whole
      // point of "ask for permission instead of forcing it" is that a
      // revoked permission has to actually stop the feature, not just get
      // silently ignored until the next cold start.
      if (state === 'active') {
        getCameraPermission().catch(() => {});
      }
    });
    return () => sub.remove();
  }, [getCameraPermission]);

  const armCooldown = useCallback(() => {
    cooldownUntilRef.current = Date.now() + cooldownSeconds * 1000;
  }, [cooldownSeconds]);

  const dismissAlert = useCallback(
    (hide: boolean) => {
      setAlertVisible(false);
      setPeekBannerVisible(false);
      setPeekPosition(null);
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

  // Deliberately turning/rotating the phone (e.g. to show a friend a
  // message) should not read as a peek. Watch for that fast-turn signature
  // only while the guard is actually running, and arm a short suppression
  // window when it happens.
  useEffect(() => {
    if (!active) return;
    const Gyroscope = getGyroscope();
    if (!Gyroscope) return;
    Gyroscope.setUpdateInterval(200);
    const sub = Gyroscope.addListener(({ x, y, z }: { x: number; y: number; z: number }) => {
      const magnitude = Math.sqrt(x * x + y * y + z * z);
      if (magnitude > ROTATION_TRIGGER_RAD_PER_S) {
        rotationSuppressUntilRef.current = Date.now() + ROTATION_SUPPRESS_MS;
        // Drop whatever partial "peek" streak had built up right before
        // the turn, so it can't complete the moment the grace window ends.
        detectorRef.current.reset();
      }
    });
    return () => sub.remove();
  }, [active]);

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
      if (Date.now() < rotationSuppressUntilRef.current) return;
      if (alertVisible || dimmed) return;
      const cam = cameraRef.current;
      if (!cam) return;

      capturingRef.current = true;
      try {
        const FaceDetection = getFaceDetection();
        if (FaceDetection) {
          // Native path: real face-count detection. Capture to a temp file
          // (uri) rather than base64 — ML Kit's detect() takes a file URI.
          // shutterSound defaults to true — without disabling it, every
          // single background sample (every 2.5s, silently, from a 2x2px
          // offscreen camera) played the real iOS camera shutter click,
          // which is exactly what surfaced as "I hear the screenshot sound
          // inside chats." This capture is meant to be invisible.
          const photo = await cam.takePictureAsync({ quality: 0.3, skipProcessing: true, shutterSound: false });
          if (photo?.uri) {
            const faces = await FaceDetection.detect(photo.uri, { performanceMode: 'fast' });
            const faceList = Array.isArray(faces) ? faces : [];
            const position = computePeekPosition(faceList, photo.width, photo.height);
            const triggered = detectorRef.current.addSample(faceList.length, position);
            if (triggered) {
              setPeekPosition(detectorRef.current.getLastPosition());
              setAlertVisible(true);
              setPeekBannerVisible(true);
            }
          }
        } else {
          // Web fallback: no ML Kit binding, use the byte-size heuristic.
          const photo = await cam.takePictureAsync({ quality: 0, base64: true, skipProcessing: true, shutterSound: false });
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
              {peekPosition
                ? `Someone may be looking from your ${peekPosition}`
                : 'Someone may be looking at your screen'}
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
              {peekPosition ? `Somebody is peeking from your ${peekPosition}` : 'Somebody is peeking'}
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
  // A camera view positioned thousands of pixels off-screen at a near-zero
  // (2x2) size is a real risk on iOS: AVFoundation's capture session can
  // fail to attach/start properly for a view that never gets a normal
  // layout pass, which would make every sample silently fail (swallowed by
  // the try/catch below) with zero visible symptom — exactly what "tested
  // with someone in frame, nothing happened" looks like. A normal-sized
  // view kept on-screen but invisible (opacity 0, no pointer events, drawn
  // behind everything else) still can't be seen or interacted with, but
  // gets the same layout/attach behavior as any other camera preview.
  hiddenCameraWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 100,
    height: 100,
    opacity: 0,
    zIndex: -1,
  },
  hiddenCamera: {
    width: 100,
    height: 100,
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
