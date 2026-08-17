import React, { useState, useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  Platform,
  ActionSheetIOS,
  Alert,
  Linking,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRoute, RouteProp, useNavigation } from "@react-navigation/native";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { Feather } from "@expo/vector-icons";
import { haptics } from "@/lib/haptics";
import { useCameraPermissions } from "expo-camera";
import { useCall } from "@/contexts/CallContext";
import { getApiUrl } from "@/lib/query-client";
import { getStoredToken } from "@/lib/auth";
import { livekitService, ConnectionState, RemoteParticipantInfo } from "@/services/livekitService";
import { playOutgoingRingback, stopOutgoingRingback } from "@/utils/ringtone";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

type RouteProps = RouteProp<RootStackParamList, "VideoCall">;

const AVATAR_COLORS = [
  "#FF6B6B",
  "#4ECDC4",
  "#45B7D1",
  "#96CEB4",
  "#FFEAA7",
  "#DDA0DD",
];

interface CallTokenResponse {
  token: string;
  identity: string;
  roomName: string;
  callId: string;
  livekitUrl: string;
}

const SMALL_SIZE = { width: 120, height: 170 };
const LARGE_SIZE = { width: 180, height: 250 };

// Lazily-loaded LiveKit VideoView — only available in native EAS builds.
// Takes the actual track instance as `videoTrack` (NOT a trackSid string —
// the real component destructures `videoTrack` and reads `.mediaStream` off
// it; passing an id here left it permanently undefined, so remote AND local
// video could never render regardless of network/connection state).
let LiveKitVideoView: React.ComponentType<{ videoTrack: any; style?: any; mirror?: boolean }> | null = null;
try {
  const lk = require('@livekit/react-native');
  if (lk && lk.VideoView) LiveKitVideoView = lk.VideoView;
} catch {}

export default function VideoCallScreen() {
  const route = useRoute<RouteProps>();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { activeCall, initiateCall, endCall } = useCall();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const { callId, receiverId, receiverName, receiverPhoneNumber: routePhoneNumber, isIncoming } = route.params;
  const receiverPhoneNumber = routePhoneNumber || activeCall?.peerPhoneNumber;
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isFrontCamera, setIsFrontCamera] = useState(true);
  const [localStatus, setLocalStatus] = useState<"connecting" | "ringing" | "connected" | "ended">(
    isIncoming ? "connected" : "connecting"
  );
  const [callState, setCallState] = useState<ConnectionState>('disconnected');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [isExpanded, setIsExpanded] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [remoteParticipants, setRemoteParticipants] = useState<RemoteParticipantInfo[]>([]);
  const [localVideoTrack, setLocalVideoTrack] = useState<any | null>(null);
  const actualCallId = useRef<string>(callId);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const context = useSharedValue({ x: 0, y: 0 });

  const currentSize = isExpanded ? LARGE_SIZE : SMALL_SIZE;
  const safeArea = {
    minX: Spacing.lg,
    maxX: screenWidth - currentSize.width - Spacing.lg,
    minY: insets.top + Spacing.lg + 40,
    maxY: screenHeight - currentSize.height - insets.bottom - 150,
  };

  useEffect(() => {
    translateX.value = safeArea.maxX;
    translateY.value = safeArea.minY;
  }, []);

  const updateExpanded = (expanded: boolean) => {
    setIsExpanded(expanded);
    haptics.light();
  };

  const panGesture = Gesture.Pan()
    .onStart(() => {
      context.value = { x: translateX.value, y: translateY.value };
    })
    .onUpdate((event) => {
      const newX = context.value.x + event.translationX;
      const newY = context.value.y + event.translationY;
      translateX.value = Math.max(safeArea.minX, Math.min(safeArea.maxX, newX));
      translateY.value = Math.max(safeArea.minY, Math.min(safeArea.maxY, newY));
    })
    .onEnd(() => {
      translateX.value = withSpring(translateX.value, { damping: 20, stiffness: 200 });
      translateY.value = withSpring(translateY.value, { damping: 20, stiffness: 200 });
    });

  const tapGesture = Gesture.Tap().onEnd(() => {
    runOnJS(updateExpanded)(!isExpanded);
  });

  const composedGesture = Gesture.Race(panGesture, tapGesture);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
  }));

  useEffect(() => {
    livekitService.setEventHandlers({
      onConnected: () => {
        setCallState('connected');
        setRetryCount(0);
      },
      onDisconnected: (_, error) => {
        setCallState('disconnected');
        if (error) setConnectionError(error.message);
      },
      onReconnecting: () => setCallState('reconnecting'),
      onReconnected: () => setCallState('connected'),
      onConnectionStateChanged: (state) => setCallState(state),
      onRemoteParticipantsChanged: (participants) => setRemoteParticipants(participants),
      onLocalVideoTrackChanged: (track) => setLocalVideoTrack(track),
      // The initial camera-enable (or a later toggle) can fail natively
      // (permission denied, device busy) after the button already flipped
      // state optimistically — this corrects isVideoEnabled to match what
      // actually happened instead of showing "camera on" over a dead track.
      // Root cause of a real "no camera shows, ever" report: if the OS
      // camera permission was previously denied, LiveKit's setCameraEnabled
      // rejects immediately on every single call with zero explanation —
      // the UI just quietly falls back to "Camera Off" and the user has no
      // way to know it's a permission problem vs. them having toggled it
      // off, since tapping the camera button just retries the same silently
      // failing call forever. Surface it once so there's an actual path to
      // fixing it (Settings), instead of a dead end that looks like a bug.
      onLocalVideoEnabledChanged: (enabled) => {
        setIsVideoEnabled(enabled);
        if (!enabled) {
          requestPermission().then((result) => {
            if (!result.granted) {
              Alert.alert(
                'Camera Access Needed',
                'Pryvo needs camera access to show your video on calls. Enable it in Settings, then rejoin the call.',
                [
                  { text: 'Not Now', style: 'cancel' },
                  { text: 'Open Settings', onPress: () => Linking.openSettings() },
                ]
              );
            }
          }).catch(() => {});
        }
      },
    });

    if (!isIncoming && !activeCall) {
      initCall();
    } else if (isIncoming) {
      setLocalStatus("connected");
      fetchCallToken(callId);
    }

    return () => {
      livekitService.disconnect();
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    // REVERTED (was build 119's "connect during ringback" change): joining
    // the LiveKit room as soon as a callId exists also meant
    // negotiateCallKey() — the E2EE key exchange for the call — started
    // immediately during ringback too, before the other person has done
    // anything. negotiateCallKey polls for up to 8 seconds waiting for the
    // peer's public key, which can't exist yet (the callee's own key POST
    // only happens once THEIR VideoCallScreen mounts, i.e. after they
    // accept) — and fetchCallToken awaits that whole negotiation before
    // ever calling livekitService.connect(). So every outgoing call picked
    // up a mandatory ~8s stall before the camera/LiveKit connection even
    // started, on top of whatever was actually reported as "Failed to
    // connect" / camera not showing. Reverting to the original, verified
    // behavior: only connect once the call is actually answered, at which
    // point both sides start their key exchange around the same time like
    // before.
    if (activeCall?.status === "connected" && localStatus !== "connected") {
      setLocalStatus("connected");
      if (activeCall.callId) {
        actualCallId.current = activeCall.callId;
        fetchCallToken(activeCall.callId);
      }
    } else if (activeCall?.status === "ringing" && localStatus === "connecting") {
      setLocalStatus("ringing");
      if (activeCall.callId) {
        actualCallId.current = activeCall.callId;
      }
    }
  }, [activeCall?.status, activeCall?.callId]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (localStatus === "connected" && callState === 'connected') {
      timer = setInterval(() => setDuration((prev) => prev + 1), 1000);
    }
    return () => clearInterval(timer);
  }, [localStatus, callState]);

  // Outgoing ringback tone — caller hears the configured ringtone (at lower
  // volume) while waiting for the callee to answer. Stops on connect, on
  // any terminal state (rejected / ended-before-connect via activeCall going
  // null or status==='ended'), and on unmount so it never leaks past call end.
  useEffect(() => {
    if (isIncoming) return;
    const callTerminated =
      !activeCall ||
      activeCall.status === 'ended' ||
      localStatus === 'ended';
    const shouldRing =
      !callTerminated &&
      (localStatus === 'connecting' || localStatus === 'ringing') &&
      callState !== 'connected';
    if (shouldRing) {
      playOutgoingRingback().catch((e) => console.error('ringback play failed', e));
    } else {
      stopOutgoingRingback().catch(() => {});
    }
    return () => {
      stopOutgoingRingback().catch(() => {});
    };
  }, [isIncoming, localStatus, callState, activeCall?.status, !!activeCall]);

  const fetchCallToken = async (currentCallId: string, currentRetry = 0) => {
    try {
      const authToken = await getStoredToken();
      if (!authToken) {
        setConnectionError('Authentication required');
        return;
      }

      const apiUrl = getApiUrl();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      let response: Response;
      try {
        response = await fetch(`${apiUrl}/api/video/token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
          },
          body: JSON.stringify({ callId: currentCallId }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        let errorData: any = {};
        try { errorData = await response.json(); } catch {}
        // Verified live that /api/video/token itself responds correctly
        // and returns a proper JSON error body on real failures (call not
        // found, not authorized, LiveKit not configured) — a bare "Failed
        // to connect" with no further detail means the response body
        // wasn't parseable JSON at all (a gateway/proxy error page rather
        // than the app's own response), which points at a network-layer
        // issue rather than the app's own logic. Surface the HTTP status
        // too so a repeat report is actually diagnosable instead of
        // hitting the same dead-end string again.
        setConnectionError(errorData.error || `Failed to connect (HTTP ${response.status})`);

        if (currentRetry < 3) {
          const next = currentRetry + 1;
          setRetryCount(next);
          retryTimeoutRef.current = setTimeout(() => fetchCallToken(currentCallId, next), 2000);
        }
        return;
      }

      const data: CallTokenResponse = await response.json();
      setConnectionError(null);
      setRetryCount(0);

      // Phase C.3: negotiate frame-encryption key. Fail CLOSED, not open —
      // this app promises end-to-end encrypted calls, so a call that
      // couldn't establish the frame-encryption key must not silently
      // connect transport-only (where LiveKit's servers could technically
      // access the media). Two checks: the key exchange itself, and —
      // separately — that the native layer actually activated E2EE with
      // that key (connect() can silently fall back to transport-only on
      // its own if RNKeyProvider/RNE2EEManager setup fails even with a
      // valid key), so isE2EEActive() is checked after connecting too.
      const { negotiateCallKey } = await import('@/lib/callE2EE');
      const e2eeKey = await negotiateCallKey({
        callId: currentCallId,
        apiUrl,
        authToken,
      });

      if (!e2eeKey) {
        setConnectionError('Could not establish end-to-end encryption for this call.');
        if (currentRetry < 3) {
          const next = currentRetry + 1;
          setRetryCount(next);
          retryTimeoutRef.current = setTimeout(() => fetchCallToken(currentCallId, next), 2000);
        }
        return;
      }

      await livekitService.connect(data.livekitUrl, data.token, {
        enableVideo: true,
        enableAudio: true,
        e2eeKey,
      });

      if (!livekitService.isE2EEActive()) {
        await livekitService.disconnect();
        setConnectionError('Could not establish end-to-end encryption for this call.');
        if (currentRetry < 3) {
          const next = currentRetry + 1;
          setRetryCount(next);
          retryTimeoutRef.current = setTimeout(() => fetchCallToken(currentCallId, next), 2000);
        }
        return;
      }
    } catch (error: any) {
      let msg = 'Connection failed. Please check your internet.';
      if (error?.name === 'AbortError') msg = 'Connection timed out. Please try again.';
      else if (error?.message?.includes('Network')) msg = 'No internet connection.';
      setConnectionError(msg);

      if (currentRetry < 3) {
        const next = currentRetry + 1;
        setRetryCount(next);
        retryTimeoutRef.current = setTimeout(() => fetchCallToken(currentCallId, next), 2000);
      }
    }
  };

  const initCall = async () => {
    setLocalStatus("connecting");
    const result = await initiateCall(receiverId, receiverName, "video");
    if (result) {
      actualCallId.current = result.callId;
      setLocalStatus("ringing");
    } else {
      setLocalStatus("ended");
      setTimeout(() => navigation.goBack(), 1000);
    }
  };

  // Shared teardown with no navigation side effect — handleEndCall (below)
  // adds the delayed goBack() for the plain "hang up" case. handleMore's
  // "Switch to Audio Call" / "Message" branches need to tear the call down
  // and navigate somewhere ELSE of their own choosing; calling the full
  // handleEndCall() there raced its own setTimeout(goBack) against the
  // navigate() call right after it — 500ms later, that stale goBack() fired
  // and popped whatever screen the explicit navigate had just pushed,
  // which is exactly what "switch to audio / message just falls back"
  // looked like.
  const teardownCall = () => {
    livekitService.disconnect();
    endCall();
    setLocalStatus("ended");
  };

  const handleEndCall = () => {
    haptics.heavy();
    teardownCall();
    setTimeout(() => navigation.goBack(), 500);
  };

  const handleToggleMute = () => {
    haptics.light();
    const enabled = livekitService.toggleLocalAudio();
    setIsMuted(!enabled);
  };

  const handleToggleVideo = async () => {
    haptics.light();
    const turningOn = !isVideoEnabled;
    if (turningOn && permission && !permission.granted) {
      // Ask (or re-check) before even attempting the native enable — avoids
      // a silent LiveKit failure being the only signal something's wrong.
      const result = await requestPermission();
      if (!result.granted) {
        haptics.warning();
        if (!result.canAskAgain) {
          Alert.alert(
            'Camera Access Needed',
            'Pryvo needs camera access to show your video on calls. Enable it in Settings, then rejoin the call.',
            [
              { text: 'Not Now', style: 'cancel' },
              { text: 'Open Settings', onPress: () => Linking.openSettings() },
            ]
          );
        }
        return;
      }
    }
    const enabled = livekitService.toggleLocalVideo();
    setIsVideoEnabled(enabled);
  };

  const handleFlipCamera = async () => {
    haptics.light();
    const flipped = await livekitService.flipCamera();
    if (flipped) {
      setIsFrontCamera((prev) => !prev);
    } else {
      haptics.warning();
    }
  };

  const handleRetry = () => {
    haptics.medium();
    setConnectionError(null);
    setRetryCount(0);
    if (actualCallId.current) fetchCallToken(actualCallId.current);
  };

  const handleMore = () => {
    haptics.light();
    const options = ['Switch to Audio Call', 'Message', 'Cancel'];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: 2, title: receiverName },
        (idx) => {
          if (idx === 0) {
            teardownCall();
            (navigation as any).replace('AudioCall', {
              callId: actualCallId.current,
              receiverId,
              receiverName,
              isIncoming: false,
            });
          } else if (idx === 1) {
            teardownCall();
            (navigation as any).replace('Conversation', {
              conversationId: activeCall?.conversationId ?? '',
              otherUserId: receiverId,
              otherUserName: receiverName,
            });
          }
        }
      );
    } else {
      Alert.alert(receiverName, undefined, [
        {
          text: 'Switch to Audio Call',
          onPress: () => {
            teardownCall();
            (navigation as any).replace('AudioCall', {
              callId: actualCallId.current,
              receiverId,
              receiverName,
              isIncoming: false,
            });
          },
        },
        {
          text: 'Message',
          onPress: () => {
            teardownCall();
            (navigation as any).replace('Conversation', {
              conversationId: activeCall?.conversationId ?? '',
              otherUserId: receiverId,
              otherUserName: receiverName,
            });
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const getStatusText = () => {
    if (connectionError) return connectionError;
    switch (localStatus) {
      case "connecting": return "Connecting...";
      case "ringing": return isIncoming ? "Incoming video call..." : "Ringing...";
      case "connected":
        if (callState === 'connecting') return "Joining room...";
        if (callState === 'reconnecting') return "Reconnecting...";
        if (callState === 'connected') return formatDuration(duration);
        return "Connecting to room...";
      case "ended": return "Call ended";
      default: return "";
    }
  };

  const avatarSeed = receiverId ?? receiverName ?? 'sealed';
  const avatarColor = AVATAR_COLORS[Math.abs(avatarSeed.charCodeAt(0)) % AVATAR_COLORS.length];
  // Render the ACTUAL published LiveKit local track, not a second
  // independent expo-camera preview session. Two separate capture sessions
  // fighting over the same physical camera device is what "camera doesn't
  // load" looked like — the self-preview could show something (or nothing)
  // with zero relation to whether video was actually being sent to the
  // other side. Now what's on screen IS what's on the wire.
  // REVERTED the ringback preview (build 119) along with the early-connect
  // effect above — see that effect's comment for why.
  const showLocalPreviewWidget = localStatus === "connected";
  const showLocalCamera = showLocalPreviewWidget && isVideoEnabled && !!localVideoTrack && !!LiveKitVideoView;
  const isFullyConnected = localStatus === "connected" && callState === 'connected';
  const remoteVideoTrack = remoteParticipants[0]?.videoTrack ?? null;
  const remoteIsMuted = remoteParticipants[0]?.isMuted ?? false;

  return (
    <View style={[styles.container, { backgroundColor: "#1a1a1a" }]}>
      {/* Remote video / placeholder */}
      <View style={[styles.remoteVideo, { backgroundColor: "#2a2a2a" }]}>
        {isFullyConnected && remoteVideoTrack && LiveKitVideoView ? (
          <LiveKitVideoView
            videoTrack={remoteVideoTrack}
            style={StyleSheet.absoluteFill}
          />
        ) : !isFullyConnected ? (
          <View style={styles.callerInfo}>
            <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
              <Feather name="user" size={64} color="#fff" />
            </View>

            <ThemedText type="h2" style={[styles.name, { color: "#fff" }]}>
              {receiverName}
            </ThemedText>

            {receiverPhoneNumber ? (
              <ThemedText type="small" style={{ color: "rgba(255,255,255,0.6)", marginBottom: Spacing.sm }}>
                {receiverPhoneNumber}
              </ThemedText>
            ) : null}

            <View style={styles.statusContainer}>
              <View style={[styles.lockIcon, { backgroundColor: "rgba(76, 217, 100, 0.2)" }]}>
                <Feather name="lock" size={12} color="#4CD964" />
              </View>
              <ThemedText type="body" style={{ color: connectionError ? "#FF6B6B" : "rgba(255,255,255,0.7)" }}>
                {getStatusText()}
              </ThemedText>
            </View>

            {connectionError ? (
              <Pressable style={styles.retryButton} onPress={handleRetry}>
                <Feather name="refresh-cw" size={16} color="#fff" />
                <ThemedText type="small" style={{ color: "#fff", marginLeft: 8 }}>
                  Retry Connection
                </ThemedText>
              </Pressable>
            ) : null}

            {retryCount > 0 && !connectionError ? (
              <ThemedText type="small" style={{ color: "rgba(255,255,255,0.5)", marginTop: Spacing.sm }}>
                Retry attempt {retryCount}/3...
              </ThemedText>
            ) : null}
          </View>
        ) : (
          // Connected but no remote video yet
          <View style={styles.videoPlaceholder}>
            <View style={[styles.largeAvatar, { backgroundColor: avatarColor }]}>
              <Feather name="user" size={80} color="#fff" />
            </View>
            <ThemedText type="body" style={{ color: "rgba(255,255,255,0.8)", marginTop: Spacing.md }}>
              {receiverName}
            </ThemedText>
            {remoteIsMuted ? (
              <View style={styles.remoteMutedBadge}>
                <Feather name="mic-off" size={12} color="rgba(255,255,255,0.6)" />
                <ThemedText type="small" style={{ color: "rgba(255,255,255,0.6)", marginLeft: 4 }}>
                  Muted
                </ThemedText>
              </View>
            ) : null}
            <ThemedText type="small" style={{ color: "rgba(255,255,255,0.4)", marginTop: Spacing.xs }}>
              {getStatusText()}
            </ThemedText>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: Spacing.xs }}>
              <Feather name="lock" size={10} color="#4CD964" />
              <ThemedText type="small" style={{ color: "#4CD964", marginLeft: 4 }}>
                {livekitService.isE2EEActive() ? 'End-to-end encrypted' : 'Encrypted call'}
              </ThemedText>
            </View>
            {Platform.OS === 'web' ? (
              <View style={styles.webNotice}>
                <Feather name="info" size={14} color="rgba(255,255,255,0.5)" />
                <ThemedText type="small" style={{ color: "rgba(255,255,255,0.5)", marginLeft: 6 }}>
                  Full video available in native app
                </ThemedText>
              </View>
            ) : (
              <View style={styles.connectedBadge}>
                <Feather name="check-circle" size={14} color="#4CD964" />
                <ThemedText type="small" style={{ color: "#4CD964", marginLeft: 6 }}>
                  Connected — camera off
                </ThemedText>
              </View>
            )}
          </View>
        )}
      </View>

      {/* Draggable local camera preview */}
      {showLocalPreviewWidget ? (
        <GestureDetector gesture={composedGesture}>
          <Animated.View
            style={[
              styles.localVideo,
              {
                backgroundColor: theme.backgroundDefault,
                width: currentSize.width,
                height: currentSize.height,
              },
              animatedStyle,
            ]}
          >
            {showLocalCamera && LiveKitVideoView ? (
              <LiveKitVideoView
                videoTrack={localVideoTrack}
                style={StyleSheet.absoluteFill}
                mirror={isFrontCamera}
              />
            ) : !isVideoEnabled ? (
              <View style={styles.videoOffContainer}>
                <Feather name="video-off" size={isExpanded ? 32 : 24} color={theme.textSecondary} />
                <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: Spacing.xs }}>
                  Camera Off
                </ThemedText>
              </View>
            ) : !permission?.granted ? (
              <Pressable onPress={requestPermission} style={styles.permissionButton}>
                <Feather name="camera" size={24} color={theme.primary} />
                <ThemedText type="small" style={{ color: theme.primary, marginTop: Spacing.xs }}>
                  Enable Camera
                </ThemedText>
              </Pressable>
            ) : (
              // Video is on and permission is granted, but LiveKit hasn't
              // reported a published local track yet (still starting the
              // camera, or the native enable is in flight) — brief loading
              // state rather than a silently blank preview.
              <Feather name="user" size={isExpanded ? 48 : 32} color={theme.textSecondary} />
            )}

            <View style={styles.selfViewHint}>
              <Feather name={isExpanded ? "minimize-2" : "maximize-2"} size={14} color="rgba(255,255,255,0.8)" />
            </View>

            <View style={styles.dragHandle}>
              <View style={styles.dragDots}>
                <View style={styles.dragDot} />
                <View style={styles.dragDot} />
                <View style={styles.dragDot} />
              </View>
            </View>
          </Animated.View>
        </GestureDetector>
      ) : null}

      {/* Top status bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + Spacing.md }]}>
        <View style={styles.statusBadge}>
          <Feather name="lock" size={12} color="#4CD964" />
          <ThemedText type="small" style={{ color: "#fff" }}>
            Encrypted
          </ThemedText>
        </View>

        {callState === 'reconnecting' ? (
          <View style={[styles.statusBadge, { backgroundColor: "rgba(255, 193, 7, 0.4)" }]}>
            <Feather name="wifi-off" size={12} color="#FFC107" />
            <ThemedText type="small" style={{ color: "#fff" }}>
              Reconnecting
            </ThemedText>
          </View>
        ) : null}

        {isFullyConnected ? (
          <View style={[styles.statusBadge, { backgroundColor: "rgba(0,0,0,0.4)" }]}>
            <ThemedText type="small" style={{ color: "#fff" }}>
              {getStatusText()}
            </ThemedText>
          </View>
        ) : null}
      </View>

      {/* Controls */}
      <View style={[styles.controls, { paddingBottom: insets.bottom + Spacing.xl }]}>
        <View style={styles.controlsContainer}>
          <View style={styles.grabHandle} />

          <View style={styles.callActions}>
            <View style={styles.buttonGroup}>
              <Pressable
                style={[
                  styles.actionButton,
                  { backgroundColor: !isVideoEnabled ? "#fff" : "rgba(255,255,255,0.15)" },
                ]}
                onPress={handleToggleVideo}
              >
                <Feather
                  name={isVideoEnabled ? "video" : "video-off"}
                  size={22}
                  color={!isVideoEnabled ? "#000" : "#fff"}
                />
              </Pressable>
              <ThemedText type="caption" style={styles.buttonLabel}>
                {isVideoEnabled ? "Camera" : "Camera Off"}
              </ThemedText>
            </View>

            <View style={styles.buttonGroup}>
              <Pressable
                style={[
                  styles.actionButton,
                  { backgroundColor: isMuted ? "#fff" : "rgba(255,255,255,0.15)" },
                ]}
                onPress={handleToggleMute}
              >
                <Feather
                  name={isMuted ? "mic-off" : "mic"}
                  size={22}
                  color={isMuted ? "#000" : "#fff"}
                />
              </Pressable>
              <ThemedText type="caption" style={styles.buttonLabel}>
                {isMuted ? "Unmute" : "Mute"}
              </ThemedText>
            </View>

            <View style={styles.buttonGroup}>
              <Pressable
                style={[styles.actionButton, { backgroundColor: "rgba(255,255,255,0.15)" }]}
                onPress={handleFlipCamera}
              >
                <Feather name="refresh-cw" size={22} color="#fff" />
              </Pressable>
              <ThemedText type="caption" style={styles.buttonLabel}>
                Flip
              </ThemedText>
            </View>

            <View style={styles.buttonGroup}>
              <Pressable
                style={[styles.actionButton, { backgroundColor: "rgba(255,255,255,0.15)" }]}
                onPress={handleMore}
              >
                <Feather name="more-horizontal" size={22} color="#fff" />
              </Pressable>
              <ThemedText type="caption" style={styles.buttonLabel}>
                More
              </ThemedText>
            </View>

            <View style={styles.buttonGroup}>
              <Pressable
                style={[styles.endButton, { backgroundColor: "#FF3B30" }]}
                onPress={handleEndCall}
              >
                {/* The standard "hang up" glyph is a plain handset rotated
                    ~135° (how FaceTime/WhatsApp/Android's own call-end
                    button render it) — Feather has no dedicated call-end
                    icon, and "phone-off" (a handset with a slash through
                    it) reads as "muted/no phone" rather than "end call". */}
                <Feather name="phone" size={22} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
              </Pressable>
              <ThemedText type="caption" style={styles.buttonLabel}>
                End
              </ThemedText>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  remoteVideo: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  callerInfo: { alignItems: "center" },
  avatar: {
    width: 140,
    height: 140,
    borderRadius: BorderRadius.full,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  largeAvatar: {
    width: 140,
    height: 140,
    borderRadius: BorderRadius.full,
    justifyContent: "center",
    alignItems: "center",
  },
  name: { marginBottom: Spacing.sm },
  statusContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  lockIcon: {
    width: 24,
    height: 24,
    borderRadius: BorderRadius.full,
    justifyContent: "center",
    alignItems: "center",
  },
  videoPlaceholder: {
    alignItems: "center",
    gap: Spacing.xs,
  },
  remoteMutedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.xs,
  },
  webNotice: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: "rgba(0,0,0,0.3)",
    borderRadius: BorderRadius.md,
  },
  connectedBadge: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: "rgba(76, 217, 100, 0.1)",
    borderRadius: BorderRadius.md,
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: BorderRadius.md,
  },
  localVideo: {
    position: "absolute",
    borderRadius: BorderRadius.lg,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.3)",
  },
  videoOffContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  permissionButton: {
    padding: Spacing.md,
    alignItems: "center",
  },
  selfViewHint: {
    position: "absolute",
    bottom: Spacing.sm,
    right: Spacing.sm,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: BorderRadius.full,
    padding: 6,
  },
  dragHandle: {
    position: "absolute",
    top: Spacing.sm,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  dragDots: {
    flexDirection: "row",
    gap: 3,
    backgroundColor: "rgba(0,0,0,0.4)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  dragDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.6)",
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: "rgba(0,0,0,0.4)",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  controls: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
  },
  controlsContainer: {
    backgroundColor: "rgba(44, 44, 46, 0.95)",
    borderRadius: 32,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    alignItems: "center",
    width: "100%",
    maxWidth: 380,
  },
  grabHandle: {
    width: 36,
    height: 5,
    backgroundColor: "rgba(255,255,255,0.3)",
    borderRadius: 3,
    marginBottom: Spacing.md,
  },
  callActions: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "flex-start",
    gap: Spacing.md,
  },
  buttonGroup: {
    alignItems: 'center',
    gap: Spacing.xs,
  },
  buttonLabel: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 11,
  },
  actionButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    justifyContent: "center",
    alignItems: "center",
  },
  endButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    justifyContent: "center",
    alignItems: "center",
  },
});
