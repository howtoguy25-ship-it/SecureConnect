import React, { useState, useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  Platform,
  ActionSheetIOS,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRoute, RouteProp, useNavigation } from "@react-navigation/native";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { Feather } from "@expo/vector-icons";
import { haptics } from "@/lib/haptics";
import { useCall } from "@/contexts/CallContext";
import { getApiUrl } from "@/lib/query-client";
import { getStoredToken } from "@/lib/auth";
import { livekitService, ConnectionState, RemoteParticipantInfo } from "@/services/livekitService";
import { playOutgoingRingback, stopOutgoingRingback } from "@/utils/ringtone";

const MAX_RETRIES = 3;

type RouteProps = RouteProp<RootStackParamList, "AudioCall">;

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

export default function AudioCallScreen() {
  const route = useRoute<RouteProps>();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { activeCall, initiateCall, endCall } = useCall();

  const { callId, receiverId, receiverName, receiverPhoneNumber: routePhoneNumber, isIncoming } = route.params;
  const receiverPhoneNumber = routePhoneNumber || activeCall?.peerPhoneNumber;
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(false);
  const [localStatus, setLocalStatus] = useState<"connecting" | "ringing" | "connected" | "ended">(
    isIncoming ? "connected" : "connecting"
  );
  const [callState, setCallState] = useState<ConnectionState>('disconnected');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [remoteParticipants, setRemoteParticipants] = useState<RemoteParticipantInfo[]>([]);
  const actualCallId = useRef<string>(callId);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
    if (isIncoming) return; // incoming side already plays via IncomingCallModal
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

        if (errorData.code === 'LIVEKIT_NOT_CONFIGURED') {
          setConnectionError('Voice calling is being set up.');
        } else {
          setConnectionError(errorData.error || 'Failed to connect');
        }

        if (currentRetry < MAX_RETRIES) {
          const next = currentRetry + 1;
          setRetryCount(next);
          retryTimeoutRef.current = setTimeout(() => fetchCallToken(currentCallId, next), 2000);
        }
        return;
      }

      const data: CallTokenResponse = await response.json();
      setConnectionError(null);
      setRetryCount(0);

      // Phase C.3: negotiate the X25519-derived frame encryption key.
      // Fail CLOSED, not open — this app promises end-to-end encrypted
      // calls, so a call that couldn't establish the frame-encryption key
      // must not silently connect transport-only (where LiveKit's servers
      // could technically access the media). Two checks: the key exchange
      // itself, and — separately — that the native layer actually
      // activated E2EE with that key (connect() can silently fall back to
      // transport-only on its own if RNKeyProvider/RNE2EEManager setup
      // fails even with a valid key), so isE2EEActive() is checked after
      // connecting too.
      const { negotiateCallKey } = await import('@/lib/callE2EE');
      const e2eeKey = await negotiateCallKey({
        callId: currentCallId,
        apiUrl,
        authToken,
      });

      if (!e2eeKey) {
        setConnectionError('Could not establish end-to-end encryption for this call.');
        if (currentRetry < MAX_RETRIES) {
          const next = currentRetry + 1;
          setRetryCount(next);
          retryTimeoutRef.current = setTimeout(() => fetchCallToken(currentCallId, next), 2000);
        }
        return;
      }

      await livekitService.connect(data.livekitUrl, data.token, {
        enableVideo: false,
        enableAudio: true,
        e2eeKey,
      });

      if (!livekitService.isE2EEActive()) {
        await livekitService.disconnect();
        setConnectionError('Could not establish end-to-end encryption for this call.');
        if (currentRetry < MAX_RETRIES) {
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

      if (currentRetry < MAX_RETRIES) {
        const next = currentRetry + 1;
        setRetryCount(next);
        retryTimeoutRef.current = setTimeout(() => fetchCallToken(currentCallId, next), 2000);
      }
    }
  };

  const initCall = async () => {
    setLocalStatus("connecting");
    const result = await initiateCall(receiverId, receiverName, "audio");
    if (result) {
      actualCallId.current = result.callId;
      setLocalStatus("ringing");
    } else {
      setLocalStatus("ended");
      setTimeout(() => navigation.goBack(), 1000);
    }
  };

  // Shared teardown with no navigation side effect — see handleMore below.
  // handleEndCall's delayed goBack() previously raced against handleMore's
  // own explicit navigate() call: 500ms after "Message" was tapped, that
  // stale goBack() fired and popped whatever screen navigate() had just
  // pushed, which is exactly what "Message just falls back" looked like.
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

  const handleToggleSpeaker = async () => {
    haptics.light();
    const enabled = await livekitService.toggleSpeaker();
    setIsSpeaker(enabled);
  };

  const handleRetry = () => {
    haptics.medium();
    setConnectionError(null);
    setRetryCount(0);
    if (actualCallId.current) fetchCallToken(actualCallId.current);
  };

  const handleMore = () => {
    haptics.light();
    const options = ['Add to Contacts', 'Message', 'Cancel'];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: 2, title: receiverName },
        (idx) => {
          if (idx === 1) {
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
        { text: 'Message', onPress: () => {
            teardownCall();
            (navigation as any).replace('Conversation', {
              conversationId: activeCall?.conversationId ?? '',
              otherUserId: receiverId,
              otherUserName: receiverName,
            });
          }
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
      case "ringing": return isIncoming ? "Incoming call..." : "Ringing...";
      case "connected":
        if (callState === 'connecting') return "Joining call...";
        if (callState === 'reconnecting') return "Reconnecting...";
        if (callState === 'connected') return formatDuration(duration);
        return "Connecting to call...";
      case "ended": return "Call ended";
      default: return "";
    }
  };

  const avatarSeed = receiverId ?? receiverName ?? 'sealed';
  const avatarColor = AVATAR_COLORS[Math.abs(avatarSeed.charCodeAt(0)) % AVATAR_COLORS.length];
  const isFullyConnected = localStatus === "connected" && callState === 'connected';
  const remoteIsMuted = remoteParticipants[0]?.isMuted ?? false;

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <View style={[styles.content, { paddingTop: insets.top + Spacing["4xl"] }]}>
        <View style={styles.callerInfo}>
          <View style={[styles.avatarWrapper]}>
            <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
              <Feather name="user" size={64} color="#fff" />
            </View>
            {isFullyConnected ? (
              <View style={[styles.liveRing, { borderColor: avatarColor + "60" }]} />
            ) : null}
          </View>

          <ThemedText type="h2" style={styles.name}>
            {receiverName}
          </ThemedText>

          {receiverPhoneNumber ? (
            <ThemedText type="small" style={{ color: theme.textSecondary, marginBottom: Spacing.sm }}>
              {receiverPhoneNumber}
            </ThemedText>
          ) : null}

          {isFullyConnected && remoteIsMuted ? (
            <View style={[styles.remoteMutedBadge, { backgroundColor: theme.backgroundSecondary }]}>
              <Feather name="mic-off" size={12} color={theme.textSecondary} />
              <ThemedText type="small" style={{ color: theme.textSecondary, marginLeft: 4 }}>
                {receiverName} is muted
              </ThemedText>
            </View>
          ) : null}

          <View style={styles.statusContainer}>
            <View style={[styles.lockIcon, { backgroundColor: theme.success + "20" }]}>
              <Feather name="lock" size={12} color={theme.success} />
            </View>
            <ThemedText type="body" style={{ color: connectionError ? theme.error : theme.textSecondary }}>
              {getStatusText()}
            </ThemedText>
          </View>

          {isFullyConnected ? (
            <ThemedText type="small" style={{ color: theme.success, marginTop: Spacing.xs }}>
              {livekitService.isE2EEActive() ? 'End-to-end encrypted' : 'Encrypted call'}
            </ThemedText>
          ) : null}

          {connectionError ? (
            <Pressable
              style={[styles.retryButton, { backgroundColor: theme.backgroundDefault }]}
              onPress={handleRetry}
            >
              <Feather name="refresh-cw" size={16} color={theme.text} />
              <ThemedText type="small" style={{ color: theme.text, marginLeft: 8 }}>
                Retry Connection
              </ThemedText>
            </Pressable>
          ) : null}

          {retryCount > 0 && !connectionError ? (
            <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: Spacing.sm }}>
              Retry attempt {retryCount}/{MAX_RETRIES}...
            </ThemedText>
          ) : null}

          {callState === 'reconnecting' ? (
            <View style={[styles.reconnectingBadge, { backgroundColor: theme.warning + "20" }]}>
              <Feather name="wifi-off" size={14} color={theme.warning} />
              <ThemedText type="small" style={{ color: theme.warning, marginLeft: 6 }}>
                Reconnecting...
              </ThemedText>
            </View>
          ) : null}

          {isFullyConnected ? (
            <View style={[styles.connectedBadge, { backgroundColor: theme.success + "10" }]}>
              <Feather name="check-circle" size={14} color={theme.success} />
              <ThemedText type="small" style={{ color: theme.success, marginLeft: 6 }}>
                Connected
              </ThemedText>
            </View>
          ) : null}
        </View>
      </View>

      <View style={[styles.controls, { paddingBottom: insets.bottom + Spacing.xl }]}>
        <View style={[styles.controlsContainer, { backgroundColor: theme.backgroundDefault }]}>
          <View style={[styles.grabHandle, { backgroundColor: theme.textSecondary + "40" }]} />

          <View style={styles.callActions}>
            <View style={styles.buttonGroup}>
              <Pressable
                style={[
                  styles.actionButton,
                  { backgroundColor: isMuted ? theme.text : theme.backgroundSecondary },
                ]}
                onPress={handleToggleMute}
              >
                <Feather
                  name={isMuted ? "mic-off" : "mic"}
                  size={22}
                  color={isMuted ? theme.backgroundDefault : theme.text}
                />
              </Pressable>
              <ThemedText type="caption" style={[styles.buttonLabel, { color: theme.textSecondary }]}>
                {isMuted ? "Unmute" : "Mute"}
              </ThemedText>
            </View>

            <View style={styles.buttonGroup}>
              <Pressable
                style={[
                  styles.actionButton,
                  { backgroundColor: isSpeaker ? theme.text : theme.backgroundSecondary },
                ]}
                onPress={handleToggleSpeaker}
              >
                <Feather
                  name="volume-2"
                  size={22}
                  color={isSpeaker ? theme.backgroundDefault : theme.text}
                />
              </Pressable>
              <ThemedText type="caption" style={[styles.buttonLabel, { color: theme.textSecondary }]}>
                Speaker
              </ThemedText>
            </View>

            <View style={styles.buttonGroup}>
              <Pressable
                style={[styles.actionButton, { backgroundColor: theme.backgroundSecondary }]}
                onPress={handleMore}
              >
                <Feather name="more-horizontal" size={22} color={theme.text} />
              </Pressable>
              <ThemedText type="caption" style={[styles.buttonLabel, { color: theme.textSecondary }]}>
                More
              </ThemedText>
            </View>

            <View style={styles.buttonGroup}>
              <Pressable
                style={[styles.endButton, { backgroundColor: "#FF3B30" }]}
                onPress={handleEndCall}
              >
                {/* See VideoCallScreen's End button for why: a rotated plain
                    handset matches the standard hang-up glyph, "phone-off"
                    reads as "muted" rather than "end call". */}
                <Feather name="phone" size={22} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
              </Pressable>
              <ThemedText type="caption" style={[styles.buttonLabel, { color: theme.textSecondary }]}>
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
  content: {
    flex: 1,
    justifyContent: "flex-start",
    paddingHorizontal: Spacing["2xl"],
  },
  callerInfo: {
    alignItems: "center",
    marginTop: Spacing["4xl"],
  },
  avatarWrapper: {
    position: 'relative',
    width: 160,
    height: 160,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  avatar: {
    width: 140,
    height: 140,
    borderRadius: BorderRadius.full,
    justifyContent: "center",
    alignItems: "center",
  },
  liveRing: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: BorderRadius.full,
    borderWidth: 2,
    opacity: 0.6,
  },
  remoteMutedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    marginBottom: Spacing.sm,
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
  connectedBadge: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.xl,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  reconnectingBadge: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  controls: {
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
  },
  controlsContainer: {
    borderRadius: 32,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    alignItems: "center",
    width: "100%",
    maxWidth: 340,
  },
  grabHandle: {
    width: 36,
    height: 5,
    borderRadius: 3,
    marginBottom: Spacing.md,
  },
  callActions: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "flex-start",
    gap: Spacing.lg,
  },
  buttonGroup: {
    alignItems: 'center',
    gap: Spacing.xs,
  },
  buttonLabel: {
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
