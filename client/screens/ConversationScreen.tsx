import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { View, StyleSheet, FlatList, TextInput, Pressable, ActivityIndicator, Modal, Platform, Animated, Alert, ImageBackground, KeyboardAvoidingView, Keyboard, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRoute, RouteProp, useNavigation, useFocusEffect } from "@react-navigation/native";
import { NativeStackNavigationProp, NativeStackScreenProps } from "@react-navigation/native-stack";
import { HeaderButton, useHeaderHeight } from "@react-navigation/elements";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl, apiRequest, fetchWithTimeout } from "@/lib/query-client";
import { getStoredToken } from "@/lib/auth";
import * as ImagePicker from "expo-image-picker";
import { haptics } from "@/lib/haptics";
import { Image } from "expo-image";
import * as Location from "expo-location";
import * as Contacts from "expo-contacts";
import * as DocumentPicker from "expo-document-picker";
import { useAudioRecorder, RecordingPresets, AudioModule, setAudioModeAsync, createAudioPlayer } from 'expo-audio';
import * as Clipboard from "expo-clipboard";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import * as ScreenCapture from "expo-screen-capture";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { playSendSound, playReceiveSound } from "@/utils/sounds";
import { getSocket, connectSocket } from "@/lib/socket";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNotifications } from "@/contexts/NotificationContext";
import { CallActionsSheet } from "@/components/CallActionsSheet";
import { AnimatedPressable } from "@/components/AnimatedPressable";
import { Camera } from "expo-camera";
import { BlurView } from "expo-blur";
import { ScrollView } from "react-native";
import { GifPicker } from "@/components/GifPicker";
import { MessageHoldOverlay, type BubbleLayout, type HoldAction, type HoldMessage } from "@/components/MessageHoldOverlay";
import { PinnedMessageBanner } from "@/components/PinnedMessageBanner";
import { ReplyPreviewBar } from "@/components/ReplyPreviewBar";
import { MessageInfoSheet } from "@/components/MessageInfoSheet";
import { DeleteConfirmSheet } from "@/components/DeleteConfirmSheet";
import {
  encryptMessage as signalEncrypt,
  decryptMessage as signalDecrypt,
  hasSession,
  type EncryptionState,
  type OutgoingMessage,
} from "@/utils/crypto/signalProtocol";
import {
  checkSealedSenderEligibility,
  sendSealedMessage,
  assertNoSenderIdLeak,
  fetchRecipientCapability,
  type SealedSenderEligibility,
} from "@/lib/sealedSender";
import type { PreKeyBundle } from "@/utils/crypto/x3dh";
import {
  E2EE_MEDIA_ENABLED,
  buildMediaEnvelope,
  parseMediaEnvelope,
  uploadEncryptedMedia,
  fetchAndDecryptEncryptedMedia,
  MAX_FILE_SIZE,
  type MediaEnvelope,
} from "@/utils/crypto/encryptedMediaClient";
import {
  buildStatusReplyEnvelope,
  parseStatusReplyEnvelope,
  type StatusReplyQuote,
} from "@/utils/statusReplyEnvelope";

type RouteProps = RouteProp<RootStackParamList, "Conversation">;
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface Message {
  id: string;
  senderId: string;
  content: string | null;
  mediaUrl: string | null;
  mediaType: string | null;
  transcription: string | null;
  status: string;
  createdAt: string;
  isHidden: boolean;
  deliveredAt?: string | null;
  readAt?: string | null;
  readBy?: string | null;
  reactions?: Record<string, string[]> | null;
  encryptionVersion?: string | null;
  e2eeInitEnvelope?: any;
  replyToMessageId?: string | null;
  replyToPreview?: string | null;
  replyToSenderId?: string | null;
  forwarded?: boolean | null;
  forwardedFromUserId?: string | null;
  deletedForEveryone?: boolean | null;
  expiresAt?: string | null;
}

export default function ConversationScreen() {
  const route = useRoute<RouteProps>();
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  // Real header height (varies by device — Dynamic Island, notch, none —
  // and by header content) rather than a hardcoded guess, so the
  // KeyboardAvoidingView below pads by exactly the right amount. A wrong
  // static number here is what let the keyboard cover the composer /
  // encryption banner on devices with a taller-than-guessed header.
  const headerHeight = useHeaderHeight();
  const { theme, isDark } = useTheme();
  const { user } = useAuth();
  
  const { conversationId, otherUserId, otherUserName } = route.params;
  const queryClient = useQueryClient();
  const { setActiveConversationId } = useNotifications();

  useFocusEffect(
    useCallback(() => {
      setActiveConversationId(conversationId);
      if (Platform.OS !== "web") {
        ScreenCapture.preventScreenCaptureAsync();
      }
      return () => {
        setActiveConversationId(null);
        if (Platform.OS !== "web") {
          ScreenCapture.allowScreenCaptureAsync();
        }
      };
    }, [conversationId])
  );
  const [screenshotDetected, setScreenshotDetected] = useState(false);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const subscription = ScreenCapture.addScreenshotListener(() => {
      setScreenshotDetected(true);
      haptics.error();
      setTimeout(() => setScreenshotDetected(false), 3000);
    });
    return () => subscription.remove();
  }, []);

  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [pendingRecordingUri, setPendingRecordingUri] = useState<string | null>(null);
  const [pendingRecordingDuration, setPendingRecordingDuration] = useState(0);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const previewSoundRef = useRef<ReturnType<typeof createAudioPlayer> | null>(null);
  const previewSoundSubRef = useRef<{ remove: () => void } | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [showMessageOptions, setShowMessageOptions] = useState(false);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(new Set());
  const [showChatSettings, setShowChatSettings] = useState(false);
  const [reportTarget, setReportTarget] = useState<{
    reportedUserId: string;
    reportedMessageId?: string;
    onComplete?: () => void;
  } | null>(null);
  const [submittingReport, setSubmittingReport] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [statusQuote, setStatusQuote] = useState<StatusReplyQuote | null>(route.params?.statusReplyQuote ?? null);
  const [pinnedMessageId, setPinnedMessageId] = useState<string | null>(null);
  // "Save" — a device-local per-message bookmark distinct from Pin (Pin is
  // one-per-conversation and shows a banner; Save can mark many messages
  // and highlights each bubble in place). Not synced to the other party or
  // across devices by design, same trust model as a personal favorite.
  const [savedMessageIds, setSavedMessageIds] = useState<Set<string>>(new Set());
  const [conversationTimer, setConversationTimer] = useState<number>(0);
  // Local outbox for sends attempted before the recipient has published
  // encryption keys. Nothing here is ever transmitted unencrypted — each
  // entry is replayed through the normal encrypt-then-send path (text via
  // deliverEncryptedText, media via uploadAndSendMedia) once a prekey
  // bundle becomes fetchable. Persisted to AsyncStorage per conversation
  // (not just component state) — a queued send that was never delivered
  // never made it into the server's message history, so if the state
  // lived only in memory, simply leaving this screen and coming back
  // (a normal stack pop, which unmounts the screen) would silently erase
  // the message the user thinks they already sent.
  const [queuedTextSends, setQueuedTextSends] = useState<Array<{
    tempId: string;
    messageContent: string;
    replySnapshot: { id: string; senderId: string } | null;
    createdAt: string;
  }>>([]);
  const [queuedMediaSends, setQueuedMediaSends] = useState<Array<{
    tempId: string;
    uri: string;
    mediaType: 'image' | 'video' | 'audio' | 'file';
    fileName?: string;
  }>>([]);
  const isFlushingQueueRef = useRef(false);
  const queuedSendsStorageKey = `queued_sends_${conversationId}`;

  const persistQueuedSends = (
    text: typeof queuedTextSends,
    media: typeof queuedMediaSends,
  ) => {
    AsyncStorage.setItem(queuedSendsStorageKey, JSON.stringify({ text, media })).catch(() => {});
  };
  // Build 74 — 'personal' | 'virtual' | null (null = not yet known, e.g.
  // an older deployed server that doesn't return numberType). Sealed
  // sender is virtual-conversation-only; when we KNOW the conversation
  // is personal we skip the sealed attempt (which would 400) entirely.
  const [conversationNumberType, setConversationNumberType] = useState<string | null>(null);
  const [showMessageInfo, setShowMessageInfo] = useState(false);
  const [showDeleteSheet, setShowDeleteSheet] = useState(false);
  const [showCallOptions, setShowCallOptions] = useState(false);
  const [isBlockedByMe, setIsBlockedByMe] = useState(false);
  const [isBlockedByThem, setIsBlockedByThem] = useState(false);
  const [otherUserPhone, setOtherUserPhone] = useState<string | undefined>(undefined);
  const [isOtherUserTyping, setIsOtherUserTyping] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastTypingEmit = useRef<number>(0);
  const recordingTimer = useRef<NodeJS.Timeout | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const messageSoundRef = useRef<ReturnType<typeof createAudioPlayer> | null>(null);
  const messageSoundSubRef = useRef<{ remove: () => void } | null>(null);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Message[]>([]);
  const [encryptionState, setEncryptionState] = useState<EncryptionState>("securing");
  const [preKeyBundle, setPreKeyBundle] = useState<PreKeyBundle | null>(null);
  const [decryptedCache, setDecryptedCache] = useState<Record<string, string>>({});
  // Phase 2 build 62 — local file URI for each decrypted-media bubble. Lives
  // only for the screen lifetime; the actual cache file on disk is wiped on
  // logout via wipeE2EEKeys() → wipeDecryptedMediaCache().
  const [decryptedMediaUris, setDecryptedMediaUris] = useState<Record<string, string>>({});
  // Per-message envelope fetch state machine: 'loading' while in flight,
  // 'error' on terminal failure (renders a retry button). Successful fetches
  // are NOT stored here — presence in decryptedMediaUris is the success
  // signal. Implemented as a Map kept in a ref so writes don't churn renders;
  // a sibling counter (mediaFetchTick) bumps to trigger re-render when state
  // transitions matter for the UI.
  const mediaFetchState = useRef<Map<string, 'loading' | 'error'>>(new Map());
  const [mediaFetchTick, setMediaFetchTick] = useState(0);
  const bumpMediaFetchTick = useCallback(() => setMediaFetchTick(t => t + 1), []);
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState<string | null>(null);
  const [reactionsMap, setReactionsMap] = useState<Record<string, Record<string, string[]>>>({});
  const [holdMessage, setHoldMessage] = useState<Message | null>(null);
  const [holdLayout, setHoldLayout] = useState<BubbleLayout | null>(null);
  const bubbleRefs = useRef<Map<string, View | null>>(new Map());
  const holdRequestId = useRef(0);

  // Shared by the mount check and the no_keys poller below — returns true
  // once the recipient has a usable session/prekey bundle.
  const checkForRecipientKeys = useCallback(async (): Promise<boolean> => {
    try {
      const token = await getStoredToken();
      const baseUrl = getApiUrl();
      const sessionExists = await hasSession(otherUserId);
      if (sessionExists) {
        setEncryptionState("encrypted");
        return true;
      }
      const bundleRes = await fetch(
        new URL(`/api/e2ee/prekeys/bundle/${otherUserId}`, baseUrl).toString(),
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (bundleRes.status === 404) {
        setEncryptionState("no_keys");
        return false;
      }
      if (bundleRes.ok) {
        const bundle: PreKeyBundle = await bundleRes.json();
        setPreKeyBundle(bundle);
        setEncryptionState("encrypted");
        return true;
      }
      setEncryptionState("no_keys");
      return false;
    } catch {
      setEncryptionState("no_keys");
      return false;
    }
  }, [otherUserId]);

  useEffect(() => {
    if (!otherUserId) return;
    checkForRecipientKeys();
  }, [otherUserId, checkForRecipientKeys]);

  // Recipient hasn't finished E2EE setup yet — poll for their keys every
  // few seconds instead of making the user manually retry. Stops as soon
  // as encryptionState leaves "no_keys" (either keys show up, or the
  // screen unmounts).
  useEffect(() => {
    if (encryptionState !== "no_keys") return;
    const interval = setInterval(() => {
      checkForRecipientKeys();
    }, 8000);
    return () => clearInterval(interval);
  }, [encryptionState, checkForRecipientKeys]);

  // Loaded from the server (message_saves table) rather than local
  // AsyncStorage, so a saved/highlighted message survives reinstalls and
  // shows up the same way on any device the user logs into — it's still
  // private to this user (never broadcast to the other participant),
  // just not device-local.
  useEffect(() => {
    if (!conversationId) return;
    (async () => {
      try {
        const token = await getStoredToken();
        const res = await fetch(new URL(`/api/conversations/${conversationId}/saved-messages`, getApiUrl()), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const { savedMessageIds: ids } = await res.json();
        setSavedMessageIds(new Set(ids ?? []));
      } catch (e) {
        console.error('Error loading saved messages:', e);
      }
    })();
  }, [conversationId]);

  const handleToggleSaveMessage = (messageId: string) => {
    const wasSaved = savedMessageIds.has(messageId);
    // Optimistic update — the bubble highlight/unhighlight should feel
    // instant; the server call runs in the background and rolls back on
    // failure.
    setSavedMessageIds((prev) => {
      const next = new Set(prev);
      if (wasSaved) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
    haptics.light();
    (async () => {
      try {
        const token = await getStoredToken();
        const url = new URL(`/api/messages/${messageId}/save`, getApiUrl());
        const res = await fetch(url, {
          method: wasSaved ? 'DELETE' : 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`save request failed: ${res.status}`);
      } catch (e) {
        console.error('Error toggling saved message:', e);
        // Roll back the optimistic flip so the UI matches server truth.
        setSavedMessageIds((prev) => {
          const next = new Set(prev);
          if (wasSaved) next.add(messageId);
          else next.delete(messageId);
          return next;
        });
      }
    })();
  };

  useEffect(() => {
    const showSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setIsKeyboardVisible(true)
    );
    const hideSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setIsKeyboardVisible(false)
    );

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const { data: chatBackgroundData } = useQuery<{ chatBackgroundUrl: string | null }>({
    queryKey: ["/api/user/chat-background"],
  });

  const chatBackgroundUrl = chatBackgroundData?.chatBackgroundUrl;

  const { data: otherUserData } = useQuery<{
    phoneNumber?: string;
    virtualNumber?: string;
    preferredNumberType?: string;
    supportsSealedSender?: boolean;
  }>({
    queryKey: [`/api/users/${otherUserId}/contact-info`],
    enabled: !!otherUserId,
  });

  useEffect(() => {
    if (otherUserData) {
      const phone = otherUserData.preferredNumberType === 'app' && otherUserData.virtualNumber
        ? otherUserData.virtualNumber
        : otherUserData.phoneNumber;
      setOtherUserPhone(phone);
    }
  }, [otherUserData]);

  const { data: blockStatus } = useQuery<{ isBlocked: boolean; blockedByThem: boolean }>({
    queryKey: [`/api/blocks/check/${otherUserId}`],
    enabled: !!otherUserId,
  });

  useEffect(() => {
    if (blockStatus) {
      setIsBlockedByMe(blockStatus.isBlocked);
      setIsBlockedByThem(blockStatus.blockedByThem);
    }
  }, [blockStatus]);

  const blockUserMutation = useMutation({
    mutationFn: async () => {
      if (!otherUserId) throw new Error("Cannot block: user ID is missing.");
      return apiRequest("POST", "/api/blocks", { blockedId: otherUserId });
    },
    onSuccess: () => {
      setIsBlockedByMe(true);
      queryClient.invalidateQueries({ queryKey: [`/api/blocks/check/${otherUserId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/blocks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      setShowChatSettings(false);
      Alert.alert("User Blocked", "You have blocked this user. They can no longer send you messages or call you.");
    },
    onError: (err: any) => {
      Alert.alert("Could Not Block", err?.message || "Something went wrong while blocking this user. Please try again.");
    },
  });

  const unblockUserMutation = useMutation({
    mutationFn: async () => {
      if (!otherUserId) throw new Error("Cannot unblock: user ID is missing.");
      return apiRequest("DELETE", `/api/blocks/${otherUserId}`);
    },
    onSuccess: () => {
      setIsBlockedByMe(false);
      queryClient.invalidateQueries({ queryKey: [`/api/blocks/check/${otherUserId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/blocks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      setShowChatSettings(false);
      Alert.alert("User Unblocked", "This user can now message and call you again.");
    },
    onError: (err: any) => {
      Alert.alert("Could Not Unblock", err?.message || "Something went wrong while unblocking this user. Please try again.");
    },
  });

  const { data: friendshipStatus } = useQuery<{
    status: 'none' | 'friends' | 'request_sent' | 'request_received';
    requestId?: string;
  }>({
    queryKey: [`/api/friends/status/${otherUserId}`],
    enabled: !!otherUserId,
  });

  const invalidateFriendship = () => {
    queryClient.invalidateQueries({ queryKey: [`/api/friends/status/${otherUserId}`] });
    queryClient.invalidateQueries({ queryKey: ["/api/friends"] });
    queryClient.invalidateQueries({ queryKey: ["/api/friends/requests"] });
  };

  const sendFriendRequestMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/friends", { friendId: otherUserId }),
    onSuccess: (result: any) => {
      invalidateFriendship();
      setShowChatSettings(false);
      Alert.alert(
        result?.autoAccepted ? "You're Friends!" : "Friend Request Sent",
        result?.autoAccepted
          ? `You and ${otherUserName} are now friends.`
          : `${otherUserName} will need to accept your request.`,
      );
    },
    onError: (err: any) => {
      Alert.alert("Could Not Send Request", err?.message || "Something went wrong. Please try again.");
    },
  });

  const acceptFriendRequestMutation = useMutation({
    mutationFn: async () => {
      if (!friendshipStatus?.requestId) throw new Error("Request not found");
      return apiRequest("POST", `/api/friends/requests/${friendshipStatus.requestId}/accept`, {});
    },
    onSuccess: () => {
      invalidateFriendship();
      setShowChatSettings(false);
      Alert.alert("You're Friends!", `You and ${otherUserName} are now friends.`);
    },
    onError: (err: any) => {
      Alert.alert("Could Not Accept", err?.message || "Something went wrong. Please try again.");
    },
  });

  const removeFriendMutation = useMutation({
    mutationFn: async () => apiRequest("DELETE", `/api/friends/${otherUserId}`),
    onSuccess: () => {
      invalidateFriendship();
      setShowChatSettings(false);
    },
    onError: (err: any) => {
      Alert.alert("Could Not Remove Friend", err?.message || "Something went wrong. Please try again.");
    },
  });

  const handleFriendAction = () => {
    const status = friendshipStatus?.status ?? 'none';
    if (status === 'none') {
      sendFriendRequestMutation.mutate();
    } else if (status === 'request_received') {
      acceptFriendRequestMutation.mutate();
    } else if (status === 'request_sent') {
      Alert.alert("Request Pending", `Your friend request to ${otherUserName} hasn't been accepted yet.`);
    } else if (status === 'friends') {
      const doRemove = () => removeFriendMutation.mutate();
      if (Platform.OS === "web") {
        if (window.confirm(`Remove ${otherUserName} as a friend?`)) doRemove();
      } else {
        Alert.alert(
          "Remove Friend",
          `Remove ${otherUserName} as a friend? They'll no longer show up for location requests or friends-only stories.`,
          [
            { text: "Cancel", style: "cancel" },
            { text: "Remove", style: "destructive", onPress: doRemove },
          ],
        );
      }
    }
  };

  const handleBlockUser = () => {
    if (!otherUserId) {
      Alert.alert("Cannot Block", "User information is still loading. Please try again in a moment.");
      return;
    }

    // On web (Replit preview iframe / browsers) Alert.alert with multi-buttons
    // can be sandboxed away; use the native browser confirm so the action actually
    // reaches the server. On iOS/Android keep the proper Alert.alert UX.
    if (Platform.OS === 'web') {
      const ok =
        typeof window !== 'undefined' && typeof window.confirm === 'function'
          ? window.confirm(
              isBlockedByMe
                ? `Unblock ${otherUserName || 'this user'}?`
                : `Block ${otherUserName || 'this user'}? They won't be able to send you messages or call you.`,
            )
          : true;
      if (!ok) return;
      if (isBlockedByMe) unblockUserMutation.mutate();
      else blockUserMutation.mutate();
      return;
    }

    if (isBlockedByMe) {
      Alert.alert(
        "Unblock User",
        `Are you sure you want to unblock ${otherUserName}?`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Unblock", onPress: () => unblockUserMutation.mutate() },
        ]
      );
    } else {
      Alert.alert(
        "Block User",
        `Block ${otherUserName}? They won't be able to send you messages or call you.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Block", style: "destructive", onPress: () => blockUserMutation.mutate() },
        ]
      );
    }
  };

  const setChatBackgroundMutation = useMutation({
    mutationFn: async (imageUri: string) => {
      const formData = new FormData();
      const filename = imageUri.split('/').pop() || 'background.jpg';
      formData.append('file', {
        uri: imageUri,
        name: filename,
        type: 'image/jpeg',
      } as any);

      const token = await getStoredToken();
      const baseUrl = getApiUrl();
      const uploadResponse = await fetch(new URL('/api/upload', baseUrl).toString(), {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload image');
      }

      const { url } = await uploadResponse.json();
      await apiRequest('PUT', '/api/user/chat-background', { chatBackgroundUrl: url });
      return url;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/chat-background"] });
      Alert.alert('Success', 'Chat background updated!');
      setShowChatSettings(false);
    },
    onError: (error: any) => {
      Alert.alert('Error', error.message || 'Failed to set background');
    },
  });

  const removeChatBackgroundMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('DELETE', '/api/user/chat-background');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/chat-background"] });
      Alert.alert('Success', 'Chat background removed!');
      setShowChatSettings(false);
    },
  });

  // Solid-color backgrounds reuse the same chatBackgroundUrl column with a
  // "color:#hex" value instead of an image path — no schema change needed.
  // Rendering below (chatBackgroundUrl.startsWith("color:")) branches to a
  // plain colored View instead of an <Image>.
  const setSolidColorBackgroundMutation = useMutation({
    mutationFn: async (hex: string) => {
      await apiRequest('PUT', '/api/user/chat-background', { chatBackgroundUrl: `color:${hex}` });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/chat-background"] });
      setShowChatSettings(false);
    },
    onError: (error: any) => {
      Alert.alert('Error', error.message || 'Failed to set background');
    },
  });

  // Five dark, purple-toned presets pulled from the app's own palette family
  // so a solid background never fights the bubble colors or clashes with
  // white text — every option here is dark enough that theme.text (#FFF)
  // and the sent/received bubble colors stay fully legible on top of it.
  const CHAT_BACKGROUND_COLORS = [
    { name: "Midnight Violet", hex: "#120E22" },
    { name: "Deep Plum", hex: "#1D1030" },
    { name: "Royal Indigo", hex: "#181433" },
    { name: "Wine Berry", hex: "#2A1024" },
    { name: "Slate Teal", hex: "#0F1E24" },
  ];

  const handleSetChatBackground = async () => {
    if (!user?.isVip) {
      Alert.alert('VIP Feature', 'Custom chat backgrounds are available for VIP members only.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: true,
    });

    if (!result.canceled && result.assets[0]) {
      haptics.medium();
      setChatBackgroundMutation.mutate(result.assets[0].uri);
    }
  };

  const fetchMessages = async () => {
    try {
      const token = await getStoredToken();
      const baseUrl = getApiUrl();
      const response = await fetchWithTimeout(new URL(`/api/conversations/${conversationId}/messages`, baseUrl), {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      if (response.ok) {
        const data = await response.json();
        const now = Date.now();
        const filtered = (data || []).filter((m: Message) => !m.expiresAt || new Date(m.expiresAt).getTime() > now);

        // Re-hydrate any locally-queued sends (recipient hadn't published
        // encryption keys yet) that were persisted before this screen last
        // unmounted. Without this, a queued message the user believes they
        // already sent would silently vanish the moment they navigate away
        // and back — it was never in the server's response above, since it
        // was never actually delivered.
        let withQueued: Message[] = filtered;
        try {
          const raw = await AsyncStorage.getItem(queuedSendsStorageKey);
          if (raw) {
            const parsed = JSON.parse(raw) as {
              text?: typeof queuedTextSends;
              media?: typeof queuedMediaSends;
            };
            if (Array.isArray(parsed.text) && parsed.text.length > 0) {
              setQueuedTextSends(parsed.text);
              const queuedMessages: Message[] = parsed.text.map((item) => ({
                id: item.tempId,
                senderId: user?.id || '',
                content: item.messageContent,
                mediaUrl: null,
                mediaType: null,
                status: 'queued',
                createdAt: item.createdAt,
                isHidden: false,
                transcription: null,
              }));
              withQueued = [...filtered, ...queuedMessages];
            }
            if (Array.isArray(parsed.media) && parsed.media.length > 0) {
              setQueuedMediaSends(parsed.media);
            }
          }
        } catch {}

        setMessages(withQueued);
        buildDecryptedCache(withQueued);
        const initialReactions: Record<string, Record<string, string[]>> = {};
        filtered.forEach((msg: Message & { reactions?: Record<string, string[]> | null }) => {
          if (msg.reactions && typeof msg.reactions === 'object') {
            initialReactions[msg.id] = msg.reactions as Record<string, string[]>;
          }
        });
        setReactionsMap(initialReactions);
      }
      try {
        const metaRes = await fetchWithTimeout(new URL(`/api/conversations/${conversationId}`, baseUrl), {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (metaRes.ok) {
          const meta = await metaRes.json();
          setPinnedMessageId(meta?.pinnedMessageId ?? null);
          setConversationTimer(Number(meta?.disappearingTimer) || 0);
          setConversationNumberType(typeof meta?.numberType === 'string' ? meta.numberType : null);
        }
      } catch {}
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchMessages();
    }, [conversationId])
  );

  useEffect(() => {
    let socket = getSocket();
    let messageHandler: ((message: Message & { conversationId?: string }) => void) | null = null;
    let typingHandler: ((data: { userId: string; conversationId: string }) => void) | null = null;
    let stopTypingHandler: ((data: { userId: string; conversationId: string }) => void) | null = null;
    let typingIndicatorTimeout: NodeJS.Timeout | null = null;
    
    const setupSocketListeners = async () => {
      if (!socket) {
        try {
          socket = await connectSocket();
        } catch (error) {
          console.log('Failed to connect socket for messages:', error);
          return;
        }
      }
      
      socket.emit('join-conversation', conversationId);
      // Mark everything in this conversation as read on entry. The server will
      // also mark-read on REST fetch, but emitting here ensures an immediate
      // socket broadcast back to the sender even if they joined the room after
      // the REST call ran.
      socket.emit('mark-read', { conversationId });

      messageHandler = (message: Message & { conversationId?: string }) => {
        if (message.conversationId !== conversationId) return;
        // System call-event rows are server-authored with senderId=caller.
        // The caller is the local user when they're the one who dialed,
        // so the usual "drop own messages" guard would hide their own
        // missed-call bubble until refresh. Let call_event rows through
        // for everyone; they're idempotent (the exists-check below
        // dedupes the conversation-room + direct-emit broadcasts).
        const isCallEvent = message.mediaType === 'call_event';
        if (!isCallEvent && message.senderId === user?.id) return;

        setMessages((prev) => {
          const exists = prev.some(m => m.id === message.id);
          if (exists) return prev;
          return [...prev, message];
        });
        if (!isCallEvent) {
          buildDecryptedCache([message]);
          playReceiveSound();
        }
        flatListRef.current?.scrollToEnd({ animated: true });
        setIsOtherUserTyping(false);

        // Skip delivery/read receipts for system events — they aren't
        // user messages and the server has no ack handler that would
        // do anything useful with them.
        if (!isCallEvent) {
          socket?.emit('message-delivered', { messageId: message.id, conversationId });
          socket?.emit('mark-read', { conversationId, messageId: message.id });
        }
      };

      // Sender side: another device confirmed delivery → update our local copy.
      const messageStatusHandler = (data: { conversationId: string; messageId: string; status: string; deliveredAt?: string }) => {
        if (data.conversationId !== conversationId) return;
        setMessages((prev) => prev.map((m) => {
          if (m.id !== data.messageId) return m;
          // Don't downgrade status (e.g. from 'read' back to 'delivered').
          if (m.status === 'read') return m;
          return { ...m, status: data.status, deliveredAt: data.deliveredAt ?? m.deliveredAt } as typeof m;
        }));
      };

      // Sender side: receiver opened the chat → flip ticks to green.
      const messagesReadHandler = (data: { conversationId: string; messageIds: string[]; readerId: string; readAt?: string }) => {
        if (data.conversationId !== conversationId) return;
        if (data.readerId === user?.id) return; // ignore our own marks
        const ids = new Set(data.messageIds);
        setMessages((prev) => prev.map((m) => {
          if (!ids.has(m.id)) return m;
          return { ...m, status: 'read', readAt: data.readAt ?? m.readAt, readBy: data.readerId } as typeof m;
        }));
      };

      typingHandler = (data: { userId: string; conversationId: string }) => {
        if (data.conversationId !== conversationId) return;
        if (data.userId === user?.id) return;
        
        setIsOtherUserTyping(true);
        
        if (typingIndicatorTimeout) {
          clearTimeout(typingIndicatorTimeout);
        }
        typingIndicatorTimeout = setTimeout(() => {
          setIsOtherUserTyping(false);
        }, 3000);
      };

      stopTypingHandler = (data: { userId: string; conversationId: string }) => {
        if (data.conversationId !== conversationId) return;
        if (data.userId === user?.id) return;
        
        setIsOtherUserTyping(false);
        if (typingIndicatorTimeout) {
          clearTimeout(typingIndicatorTimeout);
        }
      };
      
      socket.on('new-message', messageHandler);
      socket.on('user-typing', typingHandler);
      socket.on('user-stop-typing', stopTypingHandler);
      socket.on('message-status', messageStatusHandler);
      socket.on('messages-read', messagesReadHandler);
      socket.on('message-reaction', (data: { messageId: string; reactions: Record<string, string[]> | null; userId: string; emoji: string }) => {
        setReactionsMap(prev => ({
          ...prev,
          [data.messageId]: data.reactions ?? {},
        }));
      });

      socket.on('message-pinned', (data: { conversationId: string; messageId: string }) => {
        if (data.conversationId !== conversationId) return;
        setPinnedMessageId(data.messageId);
      });
      socket.on('message-unpinned', (data: { conversationId: string }) => {
        if (data.conversationId !== conversationId) return;
        setPinnedMessageId(null);
      });
      socket.on('message-deleted-for-everyone', (data: { conversationId: string; messageId: string }) => {
        if (data.conversationId !== conversationId) return;
        setMessages(prev => prev.map(m => m.id === data.messageId ? { ...m, deletedForEveryone: true, content: null, mediaUrl: null } : m));
      });
      socket.on('messages-expired', (data: { conversationId: string; messageIds: string[] }) => {
        if (data.conversationId !== conversationId) return;
        const ids = new Set(data.messageIds);
        setMessages(prev => prev.filter(m => !ids.has(m.id)));
      });
      socket.on('disappearing-timer-changed', (data: { conversationId: string; seconds?: number; disappearingTimer?: number }) => {
        if (data.conversationId !== conversationId) return;
        setConversationTimer(Number(data.seconds ?? data.disappearingTimer ?? 0));
      });
      socket.on('friend-request-received', (data: { senderId: string }) => {
        if (data.senderId !== otherUserId) return;
        queryClient.invalidateQueries({ queryKey: [`/api/friends/status/${otherUserId}`] });
        queryClient.invalidateQueries({ queryKey: ["/api/friends/requests"] });
      });
      socket.on('friend-request-accepted', (data: { byUserId: string }) => {
        if (data.byUserId !== otherUserId) return;
        queryClient.invalidateQueries({ queryKey: [`/api/friends/status/${otherUserId}`] });
        queryClient.invalidateQueries({ queryKey: ["/api/friends"] });
      });

      // Stash refs for cleanup
      messageStatusHandlerRef = messageStatusHandler;
      messagesReadHandlerRef = messagesReadHandler;
    };

    let messageStatusHandlerRef: ((data: any) => void) | null = null;
    let messagesReadHandlerRef: ((data: any) => void) | null = null;

    setupSocketListeners();

    return () => {
      if (socket) {
        socket.emit('leave-conversation', conversationId);
        if (messageHandler) {
          socket.off('new-message', messageHandler);
        }
        if (typingHandler) {
          socket.off('user-typing', typingHandler);
        }
        if (stopTypingHandler) {
          socket.off('user-stop-typing', stopTypingHandler);
        }
        if (messageStatusHandlerRef) {
          socket.off('message-status', messageStatusHandlerRef);
        }
        if (messagesReadHandlerRef) {
          socket.off('messages-read', messagesReadHandlerRef);
        }
        socket.off('message-pinned');
        socket.off('message-unpinned');
        socket.off('message-deleted-for-everyone');
        socket.off('messages-expired');
        socket.off('disappearing-timer-changed');
        socket.off('friend-request-received');
        socket.off('friend-request-accepted');
      }
      if (typingIndicatorTimeout) {
        clearTimeout(typingIndicatorTimeout);
      }
    };
  }, [conversationId, user?.id]);

  // Defensive client-side sweep: remove locally-expired messages even if the
  // server's broadcast was missed.
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      setMessages((prev) => {
        const next = prev.filter((m) => !m.expiresAt || new Date(m.expiresAt).getTime() > now);
        return next.length === prev.length ? prev : next;
      });
    }, 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (isRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isRecording, pulseAnim]);

  const decryptMessageAsync = useCallback(async (msg: Message): Promise<string | null> => {
    if (!msg.content || !otherUserId || !user?.id) return msg.content;
    const isOwn = msg.senderId === user.id;
    try {
      if (msg.content) {
        const incoming = {
          ciphertext: msg.content,
          encryptionVersion: (msg as any).encryptionVersion ?? "v2-signal",
          e2eeInitEnvelope: (msg as any).e2eeInitEnvelope ?? null,
        };
        if (incoming.encryptionVersion === "v2-signal") {
          // Build 63 Phase A: sealed-sender messages arrive with
          // `senderId: null` for the recipient. The peer in a 1:1 chat
          // is unambiguous — it's `otherUserId`. Falling back to
          // `otherUserId` makes the Signal session lookup succeed; the
          // previous `theirId = msg.senderId` value left it as null and
          // decrypt silently failed (recipient saw ciphertext).
          //
          // Group chats are out of scope for build 63. If/when they
          // land, the sealed-sender contract there will need a
          // different peer resolution (e.g. per-bubble sender hint via
          // outer envelope or recipient-side fan-out).
          const theirId = isOwn ? otherUserId : (msg.senderId ?? otherUserId);
          if (!isOwn) {
            // Dev-mode assertion: if the server ever emits a sealed
            // message with a non-null senderId for the recipient, that
            // is a server-side regression worth surfacing loudly.
            if ((msg as any).sealedSender === true && msg.senderId != null) {
              assertNoSenderIdLeak(
                { senderId: msg.senderId, sealedSender: true },
                'decryptMessageAsync.recipient',
              );
            }
            return await signalDecrypt(user.id, theirId, incoming);
          }
          const parsed = JSON.parse(msg.content);
          if (parsed?.header?.v === 2) return "[Sent encrypted]";
        }
      }
    } catch {}
    return msg.content;
  }, [otherUserId, user?.id]);

  const decryptCacheRef = useRef<Record<string, string>>({});
  const tryDecrypt = useCallback((content: string | null, msgId?: string): string | null => {
    if (!content) return content;
    if (msgId && decryptedCache[msgId] !== undefined) return decryptedCache[msgId];
    try {
      const parsed = JSON.parse(content);
      if (parsed?.header?.v === 2) return null;
      if (parsed?.nonce && parsed?.ciphertext) return null;
    } catch {}
    return content;
  }, [decryptedCache]);

  const buildDecryptedCache = useCallback(async (msgs: Message[]) => {
    if (!otherUserId || !user?.id) return;
    const updates: Record<string, string> = {};
    for (const msg of msgs) {
      if (decryptCacheRef.current[msg.id] !== undefined) continue;
      if (!msg.content) { decryptCacheRef.current[msg.id] = ""; continue; }
      const isOwn = msg.senderId === user.id;
      if (isOwn && (msg.status === "sending" || msg.status === "queued")) { decryptCacheRef.current[msg.id] = msg.content; continue; }
      try {
        const decrypted = await decryptMessageAsync(msg);
        decryptCacheRef.current[msg.id] = decrypted ?? msg.content;
        updates[msg.id] = decryptCacheRef.current[msg.id];
      } catch {
        decryptCacheRef.current[msg.id] = msg.content;
        updates[msg.id] = msg.content;
      }
    }
    if (Object.keys(updates).length > 0) {
      setDecryptedCache(prev => ({ ...prev, ...updates }));
    }
  }, [otherUserId, user?.id, decryptMessageAsync]);

  // Phase 2 build 62 — once a bubble's plaintext is in decryptedCache, see if
  // it's actually an encrypted-media envelope; if so, kick off the GCS fetch
  // + nacl.secretbox open and stash the resulting local file URI. Idempotent
  // via mediaFetchState so re-renders don't redownload the ciphertext.
  const fetchEnvelopeMedia = useCallback(async (msgId: string, envelope: MediaEnvelope) => {
    if (decryptedMediaUris[msgId]) return;
    if (mediaFetchState.current.get(msgId) === 'loading') return;
    mediaFetchState.current.set(msgId, 'loading');
    bumpMediaFetchTick();
    try {
      const token = await getStoredToken();
      if (!token) throw new Error('Not authenticated');
      const localUri = await fetchAndDecryptEncryptedMedia({
        envelope,
        token,
        apiBaseUrl: getApiUrl(),
        cacheKey: msgId,
      });
      mediaFetchState.current.delete(msgId);
      setDecryptedMediaUris(prev => ({ ...prev, [msgId]: localUri }));
    } catch (e) {
      // Terminal error — surface a retry affordance instead of hanging on a
      // forever spinner. Re-triggering goes through retryEnvelopeMedia below
      // which clears the 'error' marker so the next attempt runs cleanly.
      mediaFetchState.current.set(msgId, 'error');
      bumpMediaFetchTick();
      if (__DEV__) console.warn('[E2EE media] fetch failed:', e);
    }
  }, [decryptedMediaUris, bumpMediaFetchTick]);

  const retryEnvelopeMedia = useCallback((msgId: string, envelope: MediaEnvelope) => {
    mediaFetchState.current.delete(msgId);
    void fetchEnvelopeMedia(msgId, envelope);
  }, [fetchEnvelopeMedia]);

  useEffect(() => {
    for (const msg of messages) {
      if (decryptedMediaUris[msg.id]) continue;
      const state = mediaFetchState.current.get(msg.id);
      if (state === 'loading' || state === 'error') continue;
      const body = decryptedCache[msg.id];
      if (!body) continue;
      const envelope = parseMediaEnvelope(body);
      if (!envelope) continue;
      void fetchEnvelopeMedia(msg.id, envelope);
    }
  }, [messages, decryptedCache, decryptedMediaUris, fetchEnvelopeMedia]);

  // Build 63 Phase A — shared text-like send helper.
  //
  // Used by the location-share and contact-card flows (and could be
  // reused by any future text-shaped composer entry point). Applies
  // the SAME sealed-vs-legacy branch as `handleSend` so the identity
  // badge above the composer is truthful for every text path, not
  // just typed messages. Returns the persisted message row on success,
  // or null on failure (caller decides how to surface the error).
  //
  // Location/contact-card/media callers pass null (no replyTo affordance
  // there). "Reply with Camera" and any future reply-capable media send
  // pass the quoted message's {id, senderId} — same replyToMessageId /
  // replyToSenderId shape handleSend already uses for text replies, and
  // same restriction: replies always go through the legacy /api/messages
  // route because /send-sealed doesn't accept them (see handleSend's
  // comment on why sealed sender and replies are mutually exclusive).
  const sendTextLikeMessage = useCallback(
    async (
      enc: { ciphertext: string; encryptionVersion: string; e2eeInitEnvelope: any },
      replyTo: { id: string; senderId: string } | null,
    ): Promise<any | null> => {
      // Build 63 Phase B — close the cold-start capability window.
      //
      // `otherUserData?.supportsSealedSender` is `undefined` for the
      // first few hundred ms after opening a chat (while the
      // contact-info react-query is in-flight). If we treated that as
      // "unsupported" we'd leak senderId on the very first message of
      // every fresh chat open. Instead: if eligibility comes back
      // `recipient-capability-unknown`, resolve it synchronously
      // before deciding. The fetch is small (one short JSON row) and
      // happens at most once per chat open.
      // Build 74 — sealed sender is virtual-conversation-only. When the
      // conversation is KNOWN personal, skip the sealed attempt (the
      // server 400s it by design) and go straight to legacy — that is
      // not a leak, a personal conversation never hides sender identity.
      const knownPersonalConv = conversationNumberType === 'personal';
      let capability: boolean | undefined = otherUserData?.supportsSealedSender;
      let eligibility: SealedSenderEligibility = knownPersonalConv
        ? { eligible: false }
        : checkSealedSenderEligibility({
            currentUser: user,
            recipientSupportsSealedSender: capability,
          });
      if (eligibility.reason === "recipient-capability-unknown") {
        capability = await fetchRecipientCapability(otherUserId);
        eligibility = checkSealedSenderEligibility({
          currentUser: user,
          recipientSupportsSealedSender: capability,
        });
      }
      // Fail-closed on capability-unknown after the resolve attempt.
      // The fetch failed (network/5xx), so we don't know whether the
      // recipient supports sealed sender. Falling back to legacy here
      // would leak the sender's userId — exactly what Phase A/B exists
      // to prevent. Surface the error and abort; the user can retry.
      if (
        eligibility.reason === "recipient-capability-unknown" &&
        user?.preferredNumberType === "app" &&
        !vnInactive
      ) {
        Alert.alert(
          "Connection issue",
          "Couldn't confirm the recipient's encryption settings. Check your connection and try again.",
        );
        return null;
      }
      if (eligibility.eligible && !replyTo) {
        const sealedResult = await sendSealedMessage({
          conversationId,
          receiverId: otherUserId,
          content: enc.ciphertext,
          e2eeInitEnvelope: enc.e2eeInitEnvelope,
        });
        if (sealedResult.ok) return sealedResult.message;
        if (!sealedResult.fallbackToLegacy) return null;
        // 409: silently fall through to /api/messages.
      }
      const token = await getStoredToken();
      const baseUrl = getApiUrl();
      const response = await fetch(new URL('/api/messages', baseUrl), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          conversationId,
          receiverId: otherUserId,
          content: enc.ciphertext,
          encryptionVersion: enc.encryptionVersion,
          e2eeInitEnvelope: enc.e2eeInitEnvelope,
          replyToMessageId: replyTo?.id ?? undefined,
          replyToSenderId: replyTo?.senderId ?? undefined,
        }),
      });
      if (!response.ok) return null;
      return await response.json();
    },
    [conversationId, otherUserId, otherUserData?.supportsSealedSender, user, conversationNumberType],
  );

  // Build 63 Phase A — convenience flag for VN-inactive gating across
  // all composer entry points (text send, attachments, camera, voice).
  const vnInactive =
    user?.preferredNumberType === 'app' &&
    !!user?.virtualNumber &&
    user.virtualNumber.status !== 'active';

  const guardVnInactive = (): boolean => {
    if (!vnInactive) return false;
    Alert.alert(
      'Virtual number inactive',
      "Your virtual number is currently not active, so you can't send from it. Please restore it from Settings to resume sending.",
    );
    return true;
  };

  // Extracted from handleSend so the queued-outbox flush (see
  // flushQueuedTextSends) can deliver a message through the exact same
  // sealed-vs-legacy branch once encryption becomes possible, instead of
  // duplicating this ~120 lines of routing logic. Assumes `outgoing` is
  // already a successfully-encrypted payload — callers own the encrypt step
  // (and its no_keys handling) themselves.
  const deliverEncryptedText = async (
    outgoing: OutgoingMessage,
    tempId: string,
    messageContent: string,
    replySnapshot: { id: string; senderId: string } | null,
  ): Promise<void> => {
    const token = await getStoredToken();
    const baseUrl = getApiUrl();

    // Build 63 Phase A — sealed-sender branch. When the sender is on
    // app mode with an active virtual number AND the recipient is on
    // a build that understands sealed sender, the message goes through
    // the /send-sealed chokepoint that strips senderId before the
    // recipient sees it. On HTTP 409 we silently retry via /messages
    // so an old recipient is never left with an unreadable bubble.
    // Note: replies fall back to legacy /messages, because the
    // /send-sealed route does not accept replyToSenderId today (it
    // would re-introduce the very identifier the route is designed to
    // strip). Replies remain unsealed by design — they reveal sender
    // identity in the quoted preview anyway.
    // Build 63 Phase B — same cold-start capability resolution as
    // sendTextLikeMessage. See that helper for the rationale.
    // Build 74 — same known-personal-conversation skip as
    // sendTextLikeMessage: the sealed route 400s on personal
    // conversations by design, so go straight to legacy there.
    const knownPersonalConv = conversationNumberType === 'personal';
    let capability: boolean | undefined = otherUserData?.supportsSealedSender;
    let eligibility: SealedSenderEligibility = knownPersonalConv
      ? { eligible: false }
      : checkSealedSenderEligibility({
          currentUser: user,
          recipientSupportsSealedSender: capability,
        });
    if (eligibility.reason === "recipient-capability-unknown") {
      capability = await fetchRecipientCapability(otherUserId);
      eligibility = checkSealedSenderEligibility({
        currentUser: user,
        recipientSupportsSealedSender: capability,
      });
    }
    // Fail-closed: if the capability lookup failed (network/5xx),
    // do NOT downgrade to legacy /api/messages — that would leak the
    // sender's userId. Roll back the optimistic bubble and prompt
    // the user to retry. Replies are exempt because they go to
    // legacy by design (the sealed route doesn't accept replyTo).
    if (
      !replySnapshot &&
      eligibility.reason === "recipient-capability-unknown" &&
      user?.preferredNumberType === "app" &&
      !vnInactive
    ) {
      setMessages(prev => prev.filter(m => m.id !== tempId));
      Alert.alert(
        "Connection issue",
        "Couldn't confirm the recipient's encryption settings. Check your connection and try again.",
      );
      return;
    }
    const useSealed = eligibility.eligible && !replySnapshot;

    let response: Response | undefined;
    let usedSealedRoute = false;
    if (useSealed) {
      const sealedResult = await sendSealedMessage({
        conversationId,
        receiverId: otherUserId,
        content: outgoing.ciphertext,
        e2eeInitEnvelope: outgoing.e2eeInitEnvelope,
      });
      if (sealedResult.ok) {
        const message = sealedResult.message;
        setMessages((prev) => prev.map(m => m.id === tempId ? message : m));
        if (message?.id && message?.content) {
          decryptCacheRef.current[message.id] = messageContent;
          setDecryptedCache(prev => ({ ...prev, [message.id]: messageContent }));
        }
        setReplyTo(null);
        flatListRef.current?.scrollToEnd({ animated: true });
        playSendSound();
        usedSealedRoute = true;
      } else if (sealedResult.fallbackToLegacy) {
        // Recipient is on an old build — fall through to /api/messages.
        if (__DEV__) console.log('[sealedSender] 409 fallback to /api/messages');
      } else if (sealedResult.status === 429) {
        // Mirror the legacy-route handling for rate-limit responses.
        setMessages(prev => prev.filter(m => m.id !== tempId));
        Alert.alert(
          'Daily limit reached',
          'Your account has been temporarily limited by our Trust & Safety system. You can send up to a few messages per day. This limit resets each day.',
        );
        return;
      } else {
        // Non-409 non-429 sealed failure: mark failed (no retry — the
        // legacy route would likely fail too, and silently retrying
        // could double-send if the sealed write actually landed).
        setMessages(prev => prev.map(m =>
          m.id === tempId ? { ...m, status: 'failed' } : m,
        ));
        return;
      }
    }

    if (!usedSealedRoute) {
      response = await fetch(new URL('/api/messages', baseUrl), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          conversationId,
          receiverId: otherUserId,
          content: outgoing.ciphertext,
          encryptionVersion: outgoing.encryptionVersion,
          e2eeInitEnvelope: outgoing.e2eeInitEnvelope,
          // Only the messageId is sent; the recipient renders the quoted
          // preview from their own decrypted local cache to avoid leaking
          // plaintext to the server.
          replyToMessageId: replySnapshot?.id ?? undefined,
          replyToSenderId: replySnapshot?.senderId ?? undefined,
        }),
      });
    }

    if (usedSealedRoute) {
      // Already handled above; skip the legacy-response branch.
    } else if (response && response.ok) {
      const message = await response.json();
      setMessages((prev) => prev.map(m => m.id === tempId ? message : m));
      if (message?.id && message?.content) {
        decryptCacheRef.current[message.id] = messageContent;
        setDecryptedCache(prev => ({ ...prev, [message.id]: messageContent }));
      }
      setReplyTo(null);
      flatListRef.current?.scrollToEnd({ animated: true });
      playSendSound();
    } else if (response && response.status === 429) {
      // AI moderation has rate-limited this user. Roll back the optimistic
      // bubble and surface the limit message so they understand why.
      let body: any = {};
      try { body = await response.json(); } catch {}
      setMessages(prev => prev.filter(m => m.id !== tempId));
      Alert.alert(
        'Daily limit reached',
        body?.error ||
          `Your account has been temporarily limited by our Trust & Safety system. You can send up to ${body?.perDay ?? 5} messages per day. This limit resets each day.`,
      );
    } else {
      // Any other non-OK status: mark the bubble as failed so the user can retry.
      setMessages(prev => prev.map(m =>
        m.id === tempId ? { ...m, status: 'failed' } : m,
      ));
    }
  };

  const handleSend = async () => {
    if (!newMessage.trim() || isSending) return;

    const typedText = newMessage.trim();
    const quoteSnapshot = statusQuote;
    // If replying to a status, the quote travels INSIDE the E2EE ciphertext
    // (same trick as encrypted-media envelopes) so it round-trips through
    // encryption/decryption for both sides without the server ever seeing
    // the quoted status content.
    const messageContent = quoteSnapshot
      ? buildStatusReplyEnvelope(quoteSnapshot, typedText)
      : typedText;
    const tempId = `temp-${Date.now()}`;
    const replySnapshot = replyTo
      ? { id: replyTo.id, senderId: replyTo.senderId }
      : null;

    const optimisticMessage: Message = {
      id: tempId,
      senderId: user?.id || '',
      content: messageContent,
      mediaUrl: null,
      mediaType: null,
      status: 'sending',
      createdAt: new Date().toISOString(),
      isHidden: false,
      transcription: null,
    };

    setMessages((prev) => [...prev, optimisticMessage]);
    setNewMessage("");
    setStatusQuote(null);
    setIsSending(true);
    haptics.light();

    const socket = getSocket();
    if (socket) {
      socket.emit('stop-typing', { conversationId });
    }

    try {
      let outgoing: OutgoingMessage;
      try {
        outgoing = await signalEncrypt(
          user?.id ?? "",
          otherUserId,
          messageContent,
          preKeyBundle
        );
        setEncryptionState("encrypted");
      } catch (encErr: any) {
        if (encErr?.message === "no_keys") {
          // Don't drop the message — the recipient just hasn't finished
          // E2EE setup yet, which is common right after they sign up.
          // Queue it locally; queuedTextFlushEffect below auto-delivers
          // it (still fully encrypted, never sent in the clear) the
          // moment their keys become fetchable.
          setEncryptionState("no_keys");
          setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'queued' } : m));
          setQueuedTextSends(prev => {
            const next = [...prev, { tempId, messageContent, replySnapshot, createdAt: optimisticMessage.createdAt }];
            persistQueuedSends(next, queuedMediaSends);
            return next;
          });
          if (replySnapshot) setReplyTo(null);
          haptics.light();
          return;
        }
        throw encErr;
      }

      await deliverEncryptedText(outgoing, tempId, messageContent, replySnapshot);
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages((prev) => prev.map(m =>
        m.id === tempId ? { ...m, status: 'failed' } : m
      ));
    } finally {
      setIsSending(false);
    }
  };

  const handleTextChange = (text: string) => {
    setNewMessage(text);
    
    const socket = getSocket();
    if (!socket) return;

    const now = Date.now();
    if (text.length > 0 && now - lastTypingEmit.current > 2000) {
      socket.emit('typing', { conversationId });
      lastTypingEmit.current = now;
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('stop-typing', { conversationId });
    }, 3000);
  };

  const handlePickImage = async () => {
    setShowAttachmentMenu(false);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsMultipleSelection: false,
    });

    if (!result.canceled && result.assets[0]) {
      await uploadAndSendMedia(result.assets[0].uri, 'image');
    }
  };

  // Combined "Photos" picker: photos + videos, multi-select up to 10.
  // Asks for the media-library permission first and falls back to a graceful
  // alert if denied. Each selected asset is uploaded sequentially so any single
  // upload failure never aborts the whole batch or crashes the chat.
  const handlePickPhotos = async () => {
    setShowAttachmentMenu(false);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        if (!perm.canAskAgain && Platform.OS !== 'web') {
          Alert.alert(
            'Photos Permission Required',
            'Please enable photo library access in Settings to share photos and videos.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: async () => { try { await Linking.openSettings(); } catch {} } },
            ],
          );
        } else {
          Alert.alert('Photos Permission Required', 'Please grant access to your photos to share them.');
        }
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        quality: 0.8,
        allowsMultipleSelection: true,
        selectionLimit: 10,
      });

      if (result.canceled || !result.assets?.length) return;

      for (const asset of result.assets) {
        const isVideo = (asset.type === 'video') || /\.(mp4|mov|m4v|webm)$/i.test(asset.uri);
        try {
          await uploadAndSendMedia(asset.uri, isVideo ? 'video' : 'image');
        } catch (err) {
          console.error('Photos upload failed for one asset:', err);
        }
      }
    } catch (err) {
      console.error('handlePickPhotos error:', err);
    }
  };

  const handleOpenFile = async (localUri: string, fileName: string) => {
    try {
      if (Platform.OS === 'web') {
        // localUri is a blob: URL on web — trigger a normal browser download.
        const a = document.createElement('a');
        a.href = localUri;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return;
      }
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('Cannot Open File', 'Sharing is not available on this device.');
        return;
      }
      // The decrypted cache file is named "<messageId>.<ext>" — copy it to a
      // properly-named temp file first so the share sheet shows the real
      // filename rather than a UUID.
      const dir = `${FileSystem.cacheDirectory}shared-files/`;
      try {
        await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      } catch {
        // Already exists — ignore.
      }
      const destUri = `${dir}${fileName}`;
      await FileSystem.copyAsync({ from: localUri, to: destUri });
      await Sharing.shareAsync(destUri);
    } catch (error) {
      console.error('Failed to open file:', error);
      Alert.alert('Error', 'Could not open this file.');
    }
  };

  const handlePickFile = async () => {
    setShowAttachmentMenu(false);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;
      const file = result.assets[0];
      if (typeof file.size === 'number' && file.size > MAX_FILE_SIZE) {
        Alert.alert('File Too Large', `That file is too large to send. Max size is ${Math.floor(MAX_FILE_SIZE / (1024 * 1024))}MB.`);
        return;
      }
      try {
        await uploadAndSendMedia(file.uri, 'file', file.name || 'file');
      } catch (err) {
        console.error('File upload failed:', err);
      }
    } catch (err) {
      console.error('handlePickFile error:', err);
    }
  };

  const handlePickVideo = async () => {
    setShowAttachmentMenu(false);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      quality: 0.8,
      allowsMultipleSelection: false,
    });

    if (!result.canceled && result.assets[0]) {
      await uploadAndSendMedia(result.assets[0].uri, 'video');
    }
  };

  const handleTakePhoto = async () => {
    setShowAttachmentMenu(false);

    // On web (incl. Replit preview iframe), the native camera isn't available;
    // fall straight through to the file picker so the button is never a dead end.
    if (Platform.OS === 'web') {
      await handlePickImage();
      return;
    }

    const permission = await ImagePicker.requestCameraPermissionsAsync();
    
    if (!permission.granted) {
      if (!permission.canAskAgain) {
        Alert.alert(
          'Camera Permission Required',
          'Camera access is needed to take photos. Please enable it in your device settings.',
          [
            { text: 'Cancel', style: 'cancel' },
            { 
              text: 'Open Settings', 
              onPress: async () => {
                try {
                  await Linking.openSettings();
                } catch (error) {
                  console.log('Could not open settings');
                }
              }
            }
          ]
        );
      } else {
        Alert.alert(
          'Camera Permission Required',
          'Please grant camera access to take photos.',
          [{ text: 'OK', style: 'default' }]
        );
      }
      return;
    }

    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
        allowsEditing: false,
      });

      if (!result.canceled && result.assets && result.assets[0]?.uri) {
        await uploadAndSendMedia(result.assets[0].uri, 'image');
      }
    } catch (error: any) {
      console.error('Camera error:', error);
      Alert.alert('Camera Error', error?.message || 'Failed to open camera. Please try again.');
    }
  };

  const uploadAndSendMedia = async (uri: string, type: 'image' | 'video' | 'audio' | 'file', fileName?: string) => {
    setIsSending(true);
    haptics.medium();

    try {
      const token = await getStoredToken();
      const baseUrl = getApiUrl();

      // ── Phase 2 build 62 — encrypted media path ─────────────────────────
      // Flag-gated so QA can A/B against the legacy plaintext path. When the
      // flag flips to false, we fall through to the original upload below
      // without modification, keeping a one-line revert if anything goes
      // sideways in production.
      if (E2EE_MEDIA_ENABLED && token) {
        try {
          const { envelope, size } = await uploadEncryptedMedia({
            uri,
            mediaType: type,
            token,
            apiBaseUrl: baseUrl,
            name: fileName,
          });
          const envelopeText = buildMediaEnvelope(envelope);

          // E2EE-wrap the envelope the same way text bubbles are wrapped.
          // signalEncrypt will throw "no_keys" if the recipient hasn't set up
          // encryption yet — surface that to the user instead of silently
          // falling back to plaintext.
          let outgoing: OutgoingMessage;
          try {
            outgoing = await signalEncrypt(
              user?.id ?? "",
              otherUserId,
              envelopeText,
              preKeyBundle,
            );
          } catch (encErr: any) {
            if (encErr?.message === "no_keys") {
              // Same outbox treatment as text: don't drop it, queue the
              // original local file for a fresh upload+encrypt+send once
              // the recipient's keys become fetchable (queuedSendFlushEffect
              // below). The ciphertext blob already written to GCS above is
              // orphaned (pure ciphertext, no metadata tying it to anyone —
              // acceptable, same trade-off already made for the ordinary
              // send-fails-after-upload case a few lines down).
              setEncryptionState("no_keys");
              setQueuedMediaSends(prev => {
                const next = [...prev, { tempId: `temp-media-${Date.now()}`, uri, mediaType: type, fileName }];
                persistQueuedSends(queuedTextSends, next);
                return next;
              });
              haptics.light();
              return;
            }
            throw encErr;
          }

          // Build 63 Phase B: encrypted media is text-shaped at the
          // message-row layer (envelope lives INSIDE `outgoing.ciphertext`,
          // server never sees mediaUrl/mediaType/path/mediaKey), so it can
          // route through the same sealed-sender endpoint as text. When
          // eligible the recipient receives a message with `senderId:null`
          // exactly like a text bubble, closing the previously open Phase B
          // leak surface where media bubbles carried the sender's userId.
          //
          // sendTextLikeMessage encapsulates: eligibility check, sealed POST,
          // 409 sentinel fallback to /api/messages, and legacy POST when
          // ineligible. Returns the persisted row or null on failure.
          // Reads replyTo directly off state (same source the composer's
          // reply bar reads) so "Reply with Camera" — and any media sent
          // while a reply is staged — actually carries the quote instead
          // of silently dropping it.
          const mediaReplySnapshot = replyTo;
          const message = await sendTextLikeMessage(
            {
              ciphertext: outgoing.ciphertext,
              encryptionVersion: outgoing.encryptionVersion,
              e2eeInitEnvelope: outgoing.e2eeInitEnvelope,
            },
            mediaReplySnapshot ? { id: mediaReplySnapshot.id, senderId: mediaReplySnapshot.senderId } : null,
          );
          if (!message) {
            // sendTextLikeMessage returns null on any non-OK response.
            // The ciphertext blob already in GCS is orphaned (pure
            // ciphertext, no metadata — acceptable), but we must not
            // pretend the send succeeded.
            console.error('[E2EE media] send-sealed/legacy POST rejected');
            Alert.alert(
              'Send failed',
              'Could not send encrypted media. Please try again.',
            );
            return;
          }
          setMessages((prev) => [...prev, message]);
          // Prime caches so the sender doesn't have to round-trip through
          // /api/media/encrypted to see their own bubble. The envelope's
          // own `path` + `mk` are already known locally, so we just stash
          // the local plaintext URI directly.
          if (message?.id) {
            decryptCacheRef.current[message.id] = envelopeText;
            setDecryptedCache(prev => ({ ...prev, [message.id]: envelopeText }));
            setDecryptedMediaUris(prev => ({ ...prev, [message.id]: uri }));
          }
          if (mediaReplySnapshot) setReplyTo(null);
          flatListRef.current?.scrollToEnd({ animated: true });
          playSendSound();
          return;
        } catch (encMediaErr) {
          // Encrypted path failed — log and fall through. We deliberately do
          // NOT silently downgrade to plaintext upload for a privacy product;
          // surface the failure and abort the send.
          console.error('[E2EE media] send failed:', encMediaErr);
          Alert.alert(
            'Send failed',
            'Could not send encrypted media. Please try again.',
          );
          return;
        }
      }

      const mimeType = type === 'image' ? 'image/jpeg' : type === 'video' ? 'video/mp4' : type === 'audio' ? 'audio/mp4' : 'application/octet-stream';
      
      // Step 1: Get upload URL from server
      const uploadUrlResponse = await fetch(new URL('/api/objects/upload', baseUrl).toString(), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (!uploadUrlResponse.ok) {
        throw new Error('Failed to get upload URL');
      }
      
      const { uploadURL } = await uploadUrlResponse.json();
      
      // Step 2: Upload file directly to object storage using expo-file-system
      // Use uploadAsync for native platforms, fetch for web
      if (Platform.OS === 'web') {
        const fileResponse = await fetch(uri);
        const fileBlob = await fileResponse.blob();
        
        const uploadResponse = await fetch(uploadURL, {
          method: 'PUT',
          headers: { 'Content-Type': mimeType },
          body: fileBlob,
        });
        
        if (!uploadResponse.ok) {
          throw new Error('Failed to upload media');
        }
      } else {
        const uploadResult = await FileSystem.uploadAsync(uploadURL, uri, {
          httpMethod: 'PUT',
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
          headers: { 'Content-Type': mimeType },
        });
        
        if (uploadResult.status < 200 || uploadResult.status >= 300) {
          throw new Error('Failed to upload media');
        }
      }
      
      // Step 3: Get the media URL (strip query params from upload URL)
      const mediaUrl = uploadURL.split('?')[0];
      
      // Step 4: Set ACL to public and get the normalized object path
      const aclResponse = await fetch(new URL('/api/objects/media', baseUrl).toString(), {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mediaURL: mediaUrl }),
      });
      
      if (!aclResponse.ok) {
        throw new Error('Failed to set media permissions');
      }
      
      // Get the normalized object path from server response
      const { objectPath } = await aclResponse.json();
      
      // Build the full accessible URL using the server's object serving endpoint
      const accessibleUrl = objectPath.startsWith('/') 
        ? new URL(objectPath, baseUrl).toString()
        : objectPath;
      
      console.log('Media accessible at:', accessibleUrl);
      
      // Step 5: Create the message with accessible media URL
      const messageResponse = await fetch(new URL('/api/messages', baseUrl).toString(), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversationId,
          receiverId: otherUserId,
          content: '',
          mediaUrl: accessibleUrl,
          mediaType: type,
        }),
      });
      
      if (messageResponse.ok) {
        const message = await messageResponse.json();
        setMessages((prev) => [...prev, message]);
        flatListRef.current?.scrollToEnd({ animated: true });
      }
    } catch (error) {
      console.error('Error sending media:', error);
      Alert.alert('Upload Failed', 'Could not send the media. Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  // Drains queuedTextSends/queuedMediaSends the moment the recipient's keys
  // become available (encryptionState flips to "encrypted" via
  // checkForRecipientKeys' poll). Text is delivered directly through
  // deliverEncryptedText using a fresh signalEncrypt call; media is
  // re-run through uploadAndSendMedia end-to-end (re-upload + re-encrypt),
  // since the original attempt's upload happened before the no_keys error
  // and its ciphertext blob was left orphaned.
  useEffect(() => {
    if (encryptionState !== "encrypted") return;
    if (queuedTextSends.length === 0 && queuedMediaSends.length === 0) return;
    if (isFlushingQueueRef.current) return;

    let cancelled = false;
    (async () => {
      isFlushingQueueRef.current = true;
      try {
        const textBatch = queuedTextSends;
        setQueuedTextSends([]);
        // Clear the persisted copy now — every item in this batch is about
        // to either deliver for real (server has it) or get marked
        // 'failed' in-memory (no auto-retry on hard failure, same as any
        // other failed send), so nothing here should survive to be
        // replayed a second time on the next mount.
        persistQueuedSends([], []);
        for (const item of textBatch) {
          if (cancelled) break;
          try {
            const outgoing = await signalEncrypt(user?.id ?? "", otherUserId, item.messageContent, preKeyBundle);
            await deliverEncryptedText(outgoing, item.tempId, item.messageContent, item.replySnapshot);
          } catch (err) {
            console.error('[outbox] queued text delivery failed:', err);
            setMessages(prev => prev.map(m => m.id === item.tempId ? { ...m, status: 'failed' } : m));
          }
        }
        const mediaBatch = queuedMediaSends;
        setQueuedMediaSends([]);
        for (const item of mediaBatch) {
          if (cancelled) break;
          await uploadAndSendMedia(item.uri, item.mediaType, item.fileName);
        }
      } finally {
        isFlushingQueueRef.current = false;
      }
    })();
    return () => { cancelled = true; };
  }, [encryptionState, queuedTextSends, queuedMediaSends, otherUserId, preKeyBundle, user?.id]);

  const startVoiceRecording = async () => {
    // Step the user through what's failing rather than silently swallowing
    // errors — every early-return below tells the user exactly why.
    try {
      if (Platform.OS === 'web') {
        // The browser's MediaRecorder API exists, but expo-audio's
        // AudioModule (and our upload pipeline) is built around the native
        // file URI. Voice messages work fully on the iOS / Android binary
        // — the web build intentionally surfaces a clear message instead
        // of trying to half-implement it in the browser.
        const msg =
          "Voice messages work in the Pryvo app on iPhone or Android. " +
          "On the web (this browser), they're disabled — install the app to send voice notes.";
        if (typeof window !== 'undefined' && typeof window.alert === 'function') {
          window.alert(msg);
        } else {
          Alert.alert('Voice messages', msg);
        }
        return;
      }

      if (!AudioModule || typeof AudioModule.requestRecordingPermissionsAsync !== 'function') {
        Alert.alert(
          'Voice recording unavailable',
          'The audio module did not load. Please reload the app and try again.',
        );
        return;
      }

      const permissionResponse = await AudioModule.requestRecordingPermissionsAsync();

      if (permissionResponse.status !== 'granted') {
        if (!permissionResponse.canAskAgain) {
          Alert.alert(
            'Microphone Permission Required',
            'Microphone access is needed to record voice messages. Please enable it in your device settings.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Open Settings',
                onPress: async () => {
                  try {
                    await Linking.openSettings();
                  } catch (error) {
                    console.log('Could not open settings');
                  }
                }
              }
            ]
          );
        } else {
          Alert.alert(
            'Microphone Permission Required',
            'Please grant microphone access to record voice messages.',
            [{ text: 'OK', style: 'default' }]
          );
        }
        return;
      }

      try {
        await setAudioModeAsync({
          allowsRecording: true,
          playsInSilentMode: true,
          shouldPlayInBackground: true,
        });
      } catch (e) {
        console.warn('setAudioModeAsync failed:', e);
        // Continue — not fatal on most devices.
      }

      try {
        await audioRecorder.prepareToRecordAsync(RecordingPresets.HIGH_QUALITY);
      } catch (e: any) {
        console.error('prepareToRecordAsync failed:', e);
        Alert.alert(
          'Couldn\'t start microphone',
          e?.message || 'Another app may be using your microphone. Close it and try again.',
        );
        return;
      }

      audioRecorder.record();
      setIsRecording(true);
      setRecordingDuration(0);
      haptics.heavy();

      recordingTimer.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (error: any) {
      console.error('Failed to start recording:', error);
      Alert.alert(
        'Error',
        error?.message || 'Failed to start voice recording. Please try again.',
      );
    }
  };

  const stopVoiceRecording = async () => {
    try {
      const duration = recordingDuration;
      setIsRecording(false);
      if (recordingTimer.current) {
        clearInterval(recordingTimer.current);
        recordingTimer.current = null;
      }
      
      await audioRecorder.stop();
      await setAudioModeAsync({
        allowsRecording: false,
      });
      
      const uri = audioRecorder.uri;
      
      if (uri) {
        haptics.success();
        setPendingRecordingUri(uri);
        setPendingRecordingDuration(duration);
      }
    } catch (error) {
      console.error('Failed to stop recording:', error);
      Alert.alert('Error', 'Failed to save voice message. Please try again.');
    }
  };

  const playPreviewRecording = async () => {
    try {
      if (!pendingRecordingUri) return;

      if (isPlayingPreview && previewSoundRef.current) {
        previewSoundRef.current.pause();
        setIsPlayingPreview(false);
        return;
      }

      if (previewSoundRef.current) {
        previewSoundSubRef.current?.remove();
        previewSoundSubRef.current = null;
        previewSoundRef.current.release();
      }

      const player = createAudioPlayer({ uri: pendingRecordingUri });
      previewSoundSubRef.current = player.addListener('playbackStatusUpdate', (status: { playing: boolean; duration: number; currentTime: number }) => {
        if (!status.playing && status.duration > 0 && status.currentTime >= status.duration - 0.05) {
          setIsPlayingPreview(false);
        }
      });
      previewSoundRef.current = player;
      player.play();
      setIsPlayingPreview(true);
    } catch (error) {
      console.error('Failed to play preview:', error);
    }
  };

  const deletePreviewRecording = async () => {
    try {
      if (previewSoundRef.current) {
        previewSoundSubRef.current?.remove();
        previewSoundSubRef.current = null;
        previewSoundRef.current.release();
        previewSoundRef.current = null;
      }
      setIsPlayingPreview(false);

      if (pendingRecordingUri && Platform.OS !== 'web') {
        try {
          const { deleteAsync } = await import('expo-file-system');
          await deleteAsync(pendingRecordingUri, { idempotent: true });
        } catch (e) {
          console.log('Could not delete recording:', e);
        }
      }

      setPendingRecordingUri(null);
      setPendingRecordingDuration(0);
      setRecordingDuration(0);
      haptics.warning();
    } catch (error) {
      console.error('Failed to delete preview:', error);
    }
  };

  const sendPreviewRecording = async () => {
    try {
      if (!pendingRecordingUri) {
        console.log('No pending recording URI');
        return;
      }

      haptics.medium();

      if (previewSoundRef.current) {
        previewSoundSubRef.current?.remove();
        previewSoundSubRef.current = null;
        previewSoundRef.current.pause();
        previewSoundRef.current.release();
        previewSoundRef.current = null;
      }
      setIsPlayingPreview(false);

      const uri = pendingRecordingUri;
      console.log('Sending voice message from URI:', uri);
      
      setPendingRecordingUri(null);
      setPendingRecordingDuration(0);
      setRecordingDuration(0);

      await uploadAndSendMedia(uri, 'audio');
      haptics.success();
    } catch (error) {
      console.error('Failed to send recording:', error);
      Alert.alert('Error', 'Failed to send voice message. Please try again.');
    }
  };

  const cancelVoiceRecording = async () => {
    try {
      setIsRecording(false);
      setRecordingDuration(0);
      if (recordingTimer.current) {
        clearInterval(recordingTimer.current);
        recordingTimer.current = null;
      }
      
      if (audioRecorder) {
        await audioRecorder.stop();
        const uri = audioRecorder.uri;
        await setAudioModeAsync({
          allowsRecording: false,
        });
        
        if (uri && Platform.OS !== 'web') {
          try {
            const { deleteAsync } = await import('expo-file-system');
            await deleteAsync(uri, { idempotent: true });
          } catch (e) {
            console.log('Could not delete cancelled recording:', e);
          }
        }
      }
      
      haptics.warning();
    } catch (error) {
      console.error('Failed to cancel recording:', error);
    }
  };

  const handleShareLocation = async () => {
    setShowAttachmentMenu(false);

    if (user?.isVip) {
      Alert.alert(
        "Share Location",
        "How would you like to share your location?",
        [
          {
            text: "Send Pin",
            onPress: () => sendOneTimeLocation(),
          },
          {
            text: "Share Live Location",
            onPress: () => requestLiveLocationSharing(),
          },
          { text: "Cancel", style: "cancel" },
        ]
      );
    } else {
      sendOneTimeLocation();
    }
  };

  const sendOneTimeLocation = async () => {
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        if (perm.canAskAgain === false && Platform.OS !== 'web') {
          Alert.alert(
            'Location Permission Required',
            'Please enable location access in Settings to share your location.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: async () => { try { await Linking.openSettings(); } catch {} } },
            ],
          );
        } else {
          Alert.alert('Location Permission Required', 'Please grant location access to share your location.');
        }
        return;
      }

      // Native devices: ensure GPS / Location Services is actually on. (No equivalent check on web.)
      if (Platform.OS !== 'web') {
        const enabled = await Location.hasServicesEnabledAsync();
        if (!enabled) {
          Alert.alert('Location Services Off', 'Please turn on Location Services on your device, then try again.');
          return;
        }
      }

      // 15s timeout — prevents the "infinite loading" failure mode the audit flagged.
      const locationPromise = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Location request timed out')), 15000),
      );
      const location = await Promise.race([locationPromise, timeoutPromise]);

      const locationMessage = `Location: ${location.coords.latitude.toFixed(6)}, ${location.coords.longitude.toFixed(6)}`;

      const token = await getStoredToken();
      const baseUrl = getApiUrl();
      const enc = await signalEncrypt(user?.id ?? "", otherUserId, locationMessage, preKeyBundle);

      // Build 63 Phase A: location share is a text-shaped message. Route
      // through sealed sender so the identity badge above the composer
      // remains truthful for this entry point.
      const message = await sendTextLikeMessage(enc, /* replyTo */ null);
      if (message) {
        setMessages((prev) => [...prev, message]);
        flatListRef.current?.scrollToEnd({ animated: true });
      } else {
        Alert.alert('Could Not Send', 'Your location could not be sent. Please try again.');
      }
    } catch (error: any) {
      console.error('Error sharing location:', error);
      const msg = error?.message?.includes('timed out')
        ? 'Could not get a location fix in time. Try again outdoors or with a stronger GPS signal.'
        : 'Could not get your current location. Please try again.';
      Alert.alert('Location Error', msg);
    }
  };

  const requestLiveLocationSharing = async () => {
    try {
      await apiRequest("POST", "/api/location/request", { targetId: otherUserId });
      
      await apiRequest("POST", "/api/location/toggle", { isSharing: true });

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        await apiRequest("POST", "/api/location/update", {
          latitude: loc.coords.latitude.toString(),
          longitude: loc.coords.longitude.toString(),
        });
      }

      Alert.alert(
        "Live Location Request Sent",
        `A request has been sent to ${otherUserName || "your friend"}. Once they accept, you'll both be able to see each other's live location on the Location tab.`
      );
    } catch (error) {
      console.error('Error requesting live location:', error);
      Alert.alert("Error", "Could not send live location request. Please try again.");
    }
  };

  // ---- Real contact picker ----
  // Loads device contacts (with phone numbers), shows them in a searchable modal,
  // lets the user multi-select, then sends each one as an encrypted message.
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [deviceContacts, setDeviceContacts] = useState<Array<{ id: string; name: string; phone: string }>>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactSearch, setContactSearch] = useState('');
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());

  const sendOneContactCard = async (name: string, phone: string) => {
    try {
      // v1.0.6 contact-card payload. The magic prefix lets the renderer
      // detect this as a structured contact (tappable card with Add /
      // Call buttons) instead of plain text. Older clients that haven't
      // updated will see it as the readable fallback below the prefix —
      // still legible, just without the buttons.
      const payload = JSON.stringify({ name, phone });
      const contactMessage = `__SC_CONTACT_V1__${payload}\nContact: ${name} - ${phone}`;
      const enc = await signalEncrypt(user?.id ?? "", otherUserId, contactMessage, preKeyBundle);

      // Build 63 Phase A: contact-card payload is text-shaped — route
      // through sealed sender so the composer-badge claim is honored.
      const message = await sendTextLikeMessage(enc, /* replyTo */ null);
      if (message) {
        setMessages((prev) => [...prev, message]);
      }
    } catch (err) {
      console.error('sendOneContactCard error:', err);
    }
  };

  const handleShareContact = async () => {
    setShowAttachmentMenu(false);
    if (Platform.OS === 'web') {
      // No portable web Contacts API on iOS Safari. Sharing contacts works
      // fully on the Pryvo iOS / Android binary.
      const msg =
        "Sharing contacts works in the Pryvo app on iPhone or Android. " +
        "On the web (this browser), it's disabled — install the app to share a contact card.";
      if (typeof window !== 'undefined' && typeof window.alert === 'function') {
        window.alert(msg);
      } else {
        Alert.alert('Share contact', msg);
      }
      return;
    }
    try {
      const perm = await Contacts.requestPermissionsAsync();
      if (perm.status !== 'granted') {
        if (perm.canAskAgain === false) {
          Alert.alert(
            'Contacts Permission Required',
            'Please enable contacts access in Settings to share a contact.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: async () => { try { await Linking.openSettings(); } catch {} } },
            ],
          );
        } else {
          Alert.alert('Contacts Permission Required', 'Please grant contacts access to share a contact.');
        }
        return;
      }

      setContactSearch('');
      setSelectedContactIds(new Set());
      setShowContactPicker(true);
      setContactsLoading(true);

      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
        sort: Contacts.SortTypes.FirstName,
      });

      const flat = (data || [])
        .map((c) => ({
          id: c.id || `${c.name}-${c.phoneNumbers?.[0]?.number || ''}`,
          name: c.name || 'Unknown',
          phone: c.phoneNumbers?.[0]?.number || '',
        }))
        .filter((c) => !!c.phone);

      setDeviceContacts(flat);
    } catch (error) {
      console.error('Error loading contacts:', error);
      Alert.alert('Error', 'Could not load contacts. Please try again.');
    } finally {
      setContactsLoading(false);
    }
  };

  const sendSelectedContacts = async () => {
    const picks = deviceContacts.filter((c) => selectedContactIds.has(c.id));
    setShowContactPicker(false);
    for (const c of picks) {
      await sendOneContactCard(c.name, c.phone);
    }
    flatListRef.current?.scrollToEnd({ animated: true });
  };

  const emojiCategories = {
    smileys: ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙', '🥲', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🤧', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '🥸', '😎', '🤓', '🧐', '🥷', '🦹', '🦹‍♂️', '🦹‍♀️', '🦸', '🎭', '🕵️', '🕵️‍♂️', '🕵️‍♀️'],
    gestures: ['👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '💪', '🦾', '🦿', '🦵', '🦶', '👂', '🦻', '👃', '🧠', '🫀', '🫁', '🦷', '🦴', '👀', '👁️', '👅', '👄'],
    hearts: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '♥️', '💋', '💌', '💐', '🌹', '🥀', '🌺', '🌸', '🌷', '🌻', '🌼'],
    animals: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐻‍❄️', '🐨', '🐯', '🦁', '🐮', '🐷', '🐽', '🐸', '🐵', '🙈', '🙉', '🙊', '🐒', '🐔', '🐧', '🐦', '🐤', '🐣', '🐥', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🪱', '🐛', '🦋', '🐌', '🐞', '🐜', '🪰', '🪲', '🪳', '🦟', '🦗', '🕷️', '🕸️', '🦂'],
    food: ['🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🍆', '🥑', '🥦', '🥬', '🥒', '🌶️', '🫑', '🌽', '🥕', '🫒', '🧄', '🧅', '🥔', '🍠', '🥐', '🥯', '🍞', '🥖', '🥨', '🧀', '🥚', '🍳', '🧈', '🥞', '🧇', '🥓', '🥩', '🍗', '🍖', '🦴', '🌭', '🍔', '🍟'],
    activities: ['⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱', '🪀', '🏓', '🏸', '🏒', '🏑', '🥍', '🏏', '🪃', '🥅', '⛳', '🪁', '🏹', '🎣', '🤿', '🥊', '🥋', '🎽', '🛹', '🛼', '🛷', '⛸️', '🥌', '🎿', '⛷️', '🏂', '🪂', '🏋️', '🤼', '🤸', '🤺', '⛹️', '🤾', '🏌️', '🏇', '🧘', '🏄', '🏊', '🤽', '🚣', '🧗'],
    objects: ['💡', '🔦', '🕯️', '🪔', '🧯', '🛢️', '💸', '💵', '💴', '💶', '💷', '🪙', '💰', '💳', '💎', '⚖️', '🪜', '🧰', '🪛', '🔧', '🔨', '⚒️', '🛠️', '⛏️', '🪚', '🔩', '⚙️', '🪤', '🧱', '⛓️', '🧲', '🔫', '💣', '🧨', '🪓', '🔪', '🗡️', '⚔️', '🛡️', '🚬', '⚰️', '🪦', '⚱️', '🏺', '🔮', '📿', '🧿', '💈', '⚗️', '🔭'],
    symbols: ['💯', '🔥', '✨', '⭐', '🌟', '💫', '💥', '💢', '💦', '💨', '🕳️', '💬', '👁️‍🗨️', '🗨️', '🗯️', '💭', '💤', '🎵', '🎶', '🎼', '🎧', '📱', '💻', '⌨️', '🖥️', '🖨️', '🖱️', '🖲️', '💽', '💾', '💿', '📀', '🧮', '🎥', '🎞️', '📽️', '🎬', '📺', '📷', '📸', '📹', '📼', '🔍', '🔎', '🕰️', '⏱️', '⏲️', '⏰', '🧭', '⏳'],
  };

  const [selectedEmojiCategory, setSelectedEmojiCategory] = useState<keyof typeof emojiCategories>('smileys');

  const handleEmojiSelect = (emoji: string) => {
    setNewMessage((prev) => prev + emoji);
    haptics.light();
  };

  const handleOpenEmojiPicker = () => {
    setShowAttachmentMenu(false);
    setShowEmojiPicker(true);
  };

  const playVoiceMessage = async (messageId: string, mediaUrl: string) => {
    try {
      if (playingMessageId === messageId && messageSoundRef.current) {
        messageSoundRef.current.pause();
        setPlayingMessageId(null);
        return;
      }

      if (messageSoundRef.current) {
        messageSoundSubRef.current?.remove();
        messageSoundSubRef.current = null;
        messageSoundRef.current.release();
        messageSoundRef.current = null;
      }

      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
        interruptionMode: 'duckOthers',
      });

      // Build full URL if mediaUrl is a relative path
      let audioUrl = mediaUrl;
      if (audioUrl.startsWith('/')) {
        const baseUrl = getApiUrl();
        audioUrl = new URL(audioUrl, baseUrl).toString();
      }

      // Ensure URL uses HTTPS
      if (audioUrl.startsWith('http://')) {
        audioUrl = audioUrl.replace('http://', 'https://');
      }

      console.log('Playing voice message from URL:', audioUrl);

      const player = createAudioPlayer({ uri: audioUrl });
      // Nothing reset playingMessageId when a voice note reached the end,
      // so the button stayed stuck showing "pause" and the NEXT tap just
      // paused an already-finished player (no audible effect) instead of
      // replaying -- the reported "it just skips" bug. Reset on the real
      // end-of-track event so the icon flips back and the following tap
      // replays immediately.
      messageSoundSubRef.current = player.addListener('playbackStatusUpdate', (status: { playing: boolean; duration: number; currentTime: number }) => {
        if (!status.playing && status.duration > 0 && status.currentTime >= status.duration - 0.05) {
          setPlayingMessageId((prev) => (prev === messageId ? null : prev));
        }
      });
      player.play();
      messageSoundRef.current = player;
      setPlayingMessageId(messageId);
      haptics.light();
    } catch (error: any) {
      console.error('Failed to play voice message:', error);
      console.error('Media URL was:', mediaUrl);
      Alert.alert('Playback Error', 'Could not play the voice message.');
    }
  };

  const handleLongPressMessage = (message: Message) => {
    // Don't open the hold overlay while the user is multi-selecting messages —
    // the bubble tap already toggles selection in that mode.
    if (isSelectMode) return;
    haptics.medium();
    setSelectedMessage(message);
    const reqId = ++holdRequestId.current;
    const ref = bubbleRefs.current.get(message.id);
    const apply = (layout: BubbleLayout) => {
      // Drop the result if the user already opened/closed something else.
      if (holdRequestId.current !== reqId) return;
      setHoldLayout(layout);
      setHoldMessage(message);
    };
    if (ref && typeof (ref as any).measureInWindow === 'function') {
      (ref as any).measureInWindow((x: number, y: number, width: number, height: number) => {
        if (typeof x !== 'number' || typeof y !== 'number' || width <= 0 || height <= 0) {
          // Bad measure — use a sensible fallback rather than rendering at NaN.
          apply({ x: 16, y: 140, width: 240, height: 80 });
          return;
        }
        apply({ x, y, width, height });
      });
    } else {
      apply({ x: 16, y: 140, width: 240, height: 80 });
    }
  };

  const closeHoldOverlay = () => {
    holdRequestId.current++;
    setHoldMessage(null);
    setHoldLayout(null);
  };

  const handleReact = async (emoji: string, overrideMessageId?: string) => {
    const messageId = overrideMessageId ?? reactionPickerMessageId ?? holdMessage?.id ?? null;
    if (!messageId) return;
    setReactionPickerMessageId(null);
    try {
      const token = await getStoredToken();
      const url = new URL(`/api/messages/${messageId}/react`, getApiUrl());
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ emoji }),
      });
      if (response.ok) {
        const { reactions } = await response.json();
        setReactionsMap(prev => ({ ...prev, [messageId]: reactions ?? {} }));
      }
    } catch (error) {
      console.error('Error sending reaction:', error);
    }
  };

  const handleCopyMessage = async () => {
    const decryptedContent = selectedMessage
      ? (decryptedCache[selectedMessage.id] ?? tryDecrypt(selectedMessage.content, selectedMessage.id))
      : null;
    if (!decryptedContent) return;
    
    try {
      await Clipboard.setStringAsync(decryptedContent);
      haptics.success();
    } catch (error) {
      console.error('Error copying message:', error);
    }
    setShowMessageOptions(false);
    setSelectedMessage(null);
  };

  const handleDeleteMessage = async () => {
    if (!selectedMessage) return;
    
    Alert.alert(
      'Delete Message',
      'Are you sure you want to delete this message? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const token = await getStoredToken();
              const baseUrl = getApiUrl();
              const response = await fetch(new URL(`/api/messages/${selectedMessage.id}`, baseUrl), {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` },
              });
              
              if (response.ok) {
                setMessages((prev) => prev.filter((m) => m.id !== selectedMessage.id));
                haptics.success();
              }
            } catch (error) {
              console.error('Error deleting message:', error);
            }
          },
        },
      ]
    );
    setShowMessageOptions(false);
    setSelectedMessage(null);
  };

  const submitReport = async (
    reason: string,
    reportedUserId: string,
    reportedMessageId?: string,
  ) => {
    try {
      const token = await getStoredToken();
      const response = await fetch(new URL('/api/reports', getApiUrl()).toString(), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reportedUserId,
          reportedMessageId: reportedMessageId ?? undefined,
          reason,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data?.success) {
        haptics.success();
        Alert.alert(
          'Report Sent',
          data.message ||
            'Thank you. Our moderation team will review this within 24 hours and take appropriate action.',
        );
      } else {
        Alert.alert('Could Not Send Report', data?.error || 'Please try again.');
      }
    } catch (error) {
      console.error('Error submitting report:', error);
      Alert.alert('Could Not Send Report', 'Please check your connection and try again.');
    }
  };

  const REPORT_REASONS: { key: string; label: string }[] = [
    { key: 'spam', label: 'Spam or unwanted content' },
    { key: 'harassment', label: 'Harassment or bullying' },
    { key: 'hate_speech', label: 'Hate speech' },
    { key: 'sexual_content', label: 'Sexual or nude content' },
    { key: 'threats_or_violence', label: 'Threats or violence' },
    { key: 'csam', label: 'Child exploitation' },
    { key: 'impersonation', label: 'Impersonation' },
    { key: 'scam_or_fraud', label: 'Scam or fraud' },
    { key: 'other', label: 'Something else' },
  ];

  const showReportReasonPicker = (
    reportedUserId: string,
    reportedMessageId?: string,
    onComplete?: () => void,
  ) => {
    // Open a real bottom-sheet picker. Alert.alert can't reliably display
    // 9 buttons (iOS clips, web shows only the first).
    setReportTarget({ reportedUserId, reportedMessageId, onComplete });
  };

  const handleReportReasonPick = async (reasonKey: string) => {
    if (!reportTarget || submittingReport) return;
    const target = reportTarget;
    setSubmittingReport(true);
    // Close the sheet FIRST so iOS doesn't drop the result alert mid-dismiss
    // (this was the "glitch refresh" bug — Modal close + Alert.alert raced
    // and the alert was silently swallowed). We wait for the slide-down to
    // finish, then submit + show the alert.
    setReportTarget(null);
    try {
      await new Promise((r) => setTimeout(r, 350));
      await submitReport(reasonKey, target.reportedUserId, target.reportedMessageId);
    } finally {
      setSubmittingReport(false);
      target.onComplete?.();
    }
  };

  // Mirrors the prior Alert "Cancel" behavior: closing without picking a
  // reason still runs onComplete so callers can clear selectedMessage etc.
  const closeReportSheet = () => {
    if (submittingReport) return;
    const cb = reportTarget?.onComplete;
    setReportTarget(null);
    cb?.();
  };

  const handleReportMessage = () => {
    if (!selectedMessage || !otherUserId) return;
    const messageId = selectedMessage.id;
    const reportedUserId = selectedMessage.senderId === user?.id ? otherUserId : selectedMessage.senderId;
    setShowMessageOptions(false);
    // Tiny delay so the modal dismisses before the alert opens (iOS quirk).
    setTimeout(() => {
      showReportReasonPicker(reportedUserId, messageId, () => setSelectedMessage(null));
    }, 250);
  };

  const handleReportUser = () => {
    if (!otherUserId) return;
    setShowChatSettings(false);
    setTimeout(() => {
      showReportReasonPicker(otherUserId);
    }, 250);
  };

  const handleUnsendMessage = async () => {
    if (!selectedMessage) return;
    
    const messageTime = new Date(selectedMessage.createdAt).getTime();
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;
    
    if (now - messageTime > fiveMinutes) {
      Alert.alert('Cannot Unsend', 'Messages can only be unsent within 5 minutes of sending.');
      setShowMessageOptions(false);
      setSelectedMessage(null);
      return;
    }
    
    if (selectedMessage.senderId !== user?.id) {
      Alert.alert('Cannot Unsend', 'You can only unsend your own messages.');
      setShowMessageOptions(false);
      setSelectedMessage(null);
      return;
    }

    try {
      const token = await getStoredToken();
      const baseUrl = getApiUrl();
      const response = await fetch(new URL(`/api/messages/${selectedMessage.id}/unsend`, baseUrl), {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      if (response.ok) {
        setMessages((prev) => prev.filter((m) => m.id !== selectedMessage.id));
        haptics.success();
      }
    } catch (error) {
      console.error('Error unsending message:', error);
    }
    setShowMessageOptions(false);
    setSelectedMessage(null);
  };

  const handleShareMessage = async () => {
    if (!selectedMessage) return;
    
    try {
      if (selectedMessage.mediaUrl && await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(selectedMessage.mediaUrl);
      } else if (selectedMessage.content) {
        const decryptedShareContent = decryptedCache[selectedMessage.id] ?? tryDecrypt(selectedMessage.content, selectedMessage.id);
        if (Platform.OS === 'web') {
          if (navigator.share && decryptedShareContent) {
            await navigator.share({ text: decryptedShareContent });
          }
        }
      }
    } catch (error) {
      console.error('Error sharing message:', error);
    }
    setShowMessageOptions(false);
    setSelectedMessage(null);
  };

  const handleForwardMessage = () => {
    if (!selectedMessage) return;
    const id = selectedMessage.id;
    const plaintext = decryptedCache[id] ?? tryDecrypt(selectedMessage.content, id) ?? null;
    const originalSenderId = selectedMessage.senderId;
    const mediaUrl = selectedMessage.mediaUrl ?? null;
    const mediaType = selectedMessage.mediaType ?? null;
    setShowMessageOptions(false);
    setSelectedMessage(null);
    navigation.navigate("ForwardPicker", { messageId: id, plaintext, originalSenderId, mediaUrl, mediaType });
  };

  const handleReplyToMessage = () => {
    if (!selectedMessage) return;
    setReplyTo(selectedMessage);
    setShowMessageOptions(false);
    setSelectedMessage(null);
    haptics.light();
  };

  const handleReplyWithCamera = () => {
    if (!selectedMessage) return;
    setReplyTo(selectedMessage);
    setShowMessageOptions(false);
    setSelectedMessage(null);
    haptics.light();
    handleTakePhoto();
  };

  const handlePinMessage = async () => {
    if (!selectedMessage) return;
    const id = selectedMessage.id;
    setShowMessageOptions(false);
    setSelectedMessage(null);
    try {
      const token = await getStoredToken();
      const url = pinnedMessageId === id
        ? new URL(`/api/conversations/${conversationId}/pin`, getApiUrl())
        : new URL(`/api/conversations/${conversationId}/pin`, getApiUrl());
      const isUnpin = pinnedMessageId === id;
      const res = await fetch(url, {
        method: isUnpin ? 'DELETE' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: isUnpin ? undefined : JSON.stringify({ messageId: id }),
      });
      if (res.ok) {
        setPinnedMessageId(isUnpin ? null : id);
        haptics.success();
      }
    } catch (e) {
      console.error('pin err', e);
    }
  };

  const handleShowMessageInfo = () => {
    setShowMessageOptions(false);
    setShowMessageInfo(true);
  };

  const handleDeleteForEveryone = async () => {
    if (!selectedMessage) return;
    const id = selectedMessage.id;
    setShowDeleteSheet(false);
    setSelectedMessage(null);
    try {
      const token = await getStoredToken();
      const res = await fetch(
        new URL(`/api/messages/${id}/delete-for-everyone`, getApiUrl()),
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
        }
      );
      if (res.ok) {
        setMessages(prev => prev.map(m => m.id === id ? { ...m, deletedForEveryone: true, content: null, mediaUrl: null } : m));
        haptics.success();
      } else {
        const errBody = await res.json().catch(() => ({}));
        Alert.alert('Cannot delete', errBody?.error || 'You can only delete your own messages within 1 hour.');
      }
    } catch (e) {
      console.error('delete-for-everyone err', e);
    }
  };

  const handleScrollToMessage = (msgId: string) => {
    const idx = messages.findIndex(m => m.id === msgId);
    if (idx >= 0 && flatListRef.current) {
      try {
        flatListRef.current.scrollToIndex({ index: idx, animated: true, viewPosition: 0.3 });
      } catch {}
    }
  };

  const openConversationTimerPicker = () => {
    setShowChatSettings(false);
    navigation.navigate("DisappearingMessages", {
      scope: "conversation",
      conversationId,
      currentTimer: conversationTimer,
    });
  };

  const canUnsend = (message: Message | null) => {
    if (!message || message.senderId !== user?.id) return false;
    const messageTime = new Date(message.createdAt).getTime();
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;
    return now - messageTime <= fiveMinutes;
  };

  const handleHideToLocker = async () => {
    if (!selectedMessage) return;

    // Always close the action menu first so the alert isn't hidden behind it.
    setShowMessageOptions(false);

    if (!user?.isVip) {
      Alert.alert(
        'VIP Feature',
        'Hide to Locker is a VIP feature. Upgrade to VIP to hide messages and media in your private locker, protected by a PIN.',
        [
          { text: 'Not Now', style: 'cancel' },
          { text: 'Upgrade', onPress: () => { try { (navigation as any)?.navigate?.('VipUpgrade'); } catch {} } },
        ],
      );
      return;
    }

    try {
      const token = await getStoredToken();
      const baseUrl = getApiUrl();

      // If the user hasn't set up a Locker PIN yet, send them to the locker tab to set one up first.
      const pinCheck = await fetch(new URL('/api/locker/has-pin', baseUrl).toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (pinCheck.ok) {
        const { hasPin } = await pinCheck.json();
        if (!hasPin) {
          Alert.alert(
            'Set Up Your Locker',
            'Before hiding messages, set up a 4-digit PIN to protect your locker.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Set Up PIN',
                onPress: () => { try { (navigation as any)?.navigate?.('Main', { screen: 'LockerTab' }); } catch {} },
              },
            ],
          );
          setSelectedMessage(null);
          return;
        }
      }

      // Locker Phase 1: server refuses plaintext saves. Saving from
      // here requires the user to unlock the locker first (so the
      // master key is in memory) — direct them to the Locker tab to
      // unlock, then come back. A future iteration will add an inline
      // PIN prompt + encrypt-and-save without leaving the chat.
      setSelectedMessage(null);
      Alert.alert(
        'Unlock Locker First',
        'Your locker is end-to-end encrypted. Open the Locker tab and enter your PIN once — then come back here to hide messages.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Locker', onPress: () => { try { (navigation as any)?.navigate?.('Main', { screen: 'LockerTab' }); } catch {} } },
        ],
      );
      return;
    } catch (error) {
      console.error('Error hiding to locker:', error);
      Alert.alert('Could Not Hide', 'Please check your connection and try again.');
    }
  };

  const formatRecordingTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const renderStatusTicks = (status: string) => {
    if (status === "sent") {
      return (
        <View style={styles.tickContainer}>
          <Feather name="check" size={14} color={theme.textSecondary} />
        </View>
      );
    } else if (status === "delivered") {
      return (
        <View style={styles.tickContainer}>
          <Feather name="check" size={14} color={theme.textSecondary} />
          <Feather name="check" size={14} color={theme.textSecondary} style={styles.secondTick} />
        </View>
      );
    } else if (status === "read") {
      return (
        <View style={styles.tickContainer}>
          <Feather name="check" size={14} color="#25D366" />
          <Feather name="check" size={14} color="#25D366" style={styles.secondTick} />
        </View>
      );
    }
    return null;
  };

  const toggleMessageSelection = (messageId: string) => {
    setSelectedMessageIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(messageId)) {
        newSet.delete(messageId);
      } else {
        newSet.add(messageId);
      }
      return newSet;
    });
  };

  const handleEnterSelectMode = (message: Message) => {
    setIsSelectMode(true);
    setSelectedMessageIds(new Set([message.id]));
    setShowMessageOptions(false);
    haptics.medium();
  };

  const handleExitSelectMode = () => {
    setIsSelectMode(false);
    setSelectedMessageIds(new Set());
  };

  const handleDeleteSelected = async () => {
    const count = selectedMessageIds.size;
    Alert.alert(
      'Delete Messages',
      `Delete ${count} selected message${count > 1 ? 's' : ''}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const token = await getStoredToken();
              const baseUrl = getApiUrl();
              const idsToDelete = Array.from(selectedMessageIds);
              
              for (const id of idsToDelete) {
                await fetch(new URL(`/api/messages/${id}`, baseUrl), {
                  method: 'DELETE',
                  headers: { 'Authorization': `Bearer ${token}` },
                });
              }
              
              setMessages(prev => prev.filter(m => !selectedMessageIds.has(m.id)));
              handleExitSelectMode();
              haptics.success();
            } catch (error) {
              console.error('Error deleting messages:', error);
            }
          },
        },
      ]
    );
  };

  const handleCopySelected = async () => {
    const selectedMsgs = messages.filter(m => selectedMessageIds.has(m.id));
    const textContent = selectedMsgs
      .filter(m => m.content)
      .map(m => decryptedCache[m.id] ?? tryDecrypt(m.content, m.id))
      .filter(Boolean)
      .join('\n');
    
    if (textContent) {
      await Clipboard.setStringAsync(textContent);
      haptics.success();
    }
    handleExitSelectMode();
  };

  const handleShareSelected = async () => {
    const selectedMsgs = messages.filter(m => selectedMessageIds.has(m.id));
    const textContent = selectedMsgs
      .filter(m => m.content)
      .map(m => decryptedCache[m.id] ?? tryDecrypt(m.content, m.id))
      .filter(Boolean)
      .join('\n');
    
    if (textContent && Platform.OS !== 'web') {
      try {
        if (typeof navigator !== 'undefined' && navigator.share) {
          await navigator.share({ text: textContent });
        }
      } catch (error) {
        console.log('Share cancelled');
      }
    }
    handleExitSelectMode();
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isOwn = item.senderId === user?.id;
    const isSelected = selectedMessageIds.has(item.id);

    // ── System call-event bubble ───────────────────────────────────────
    // Server-authored, unencrypted (encryptionVersion='none') row written
    // when a call is missed, declined, or ended without being answered.
    // `content` is a JSON envelope: {action, callType, duration?}.
    // Rendered as a centered system row with phone/video icon; tap to
    // place a new call of the same type. Skips selection-mode and the
    // long-press action menu — it isn't a user message.
    if (item.mediaType === 'call_event') {
      let evt: { action?: string; callType?: string; duration?: number } = {};
      try { evt = JSON.parse(item.content || '{}'); } catch {}
      const isVideo = evt.callType === 'video';
      // isOwn here = the caller (server stamps senderId=callerId on the
      // event row). Recipient sees the opposite label.
      const verb = evt.action === 'declined'
        ? (isOwn ? 'Call declined' : 'You declined the call')
        : evt.action === 'ended'
          ? (isOwn ? 'Outgoing call' : 'Incoming call')
          : (isOwn ? 'No answer' : 'Missed call');
      // Only show the red "missed" tint on the recipient's side, and
      // only for an actual missed (not declined-by-them) event.
      const isMissedForRecipient = !isOwn && evt.action !== 'declined' && evt.action !== 'ended';
      const durationLabel = typeof evt.duration === 'number' && evt.duration > 0
        ? `${Math.floor(evt.duration / 60)}:${String(evt.duration % 60).padStart(2, '0')}`
        : null;
      const tint = isMissedForRecipient ? theme.error : theme.textSecondary;
      const onTapCall = () => {
        if (isSelectMode) return;
        haptics.medium();
        navigation.navigate(isVideo ? 'VideoCall' : 'AudioCall', {
          callId: '',
          receiverId: otherUserId,
          receiverName: otherUserName,
        });
      };
      return (
        <Pressable
          onPress={onTapCall}
          style={{
            alignSelf: 'center',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingHorizontal: Spacing.md,
            paddingVertical: 8,
            borderRadius: BorderRadius.xl,
            backgroundColor: theme.backgroundSecondary,
            marginVertical: 6,
            maxWidth: '85%',
          }}
        >
          <Feather
            name={isVideo ? 'video' : 'phone-missed'}
            size={14}
            color={tint}
          />
          <ThemedText style={{ color: tint, fontSize: 13, fontWeight: '500' }}>
            {verb}
            {durationLabel ? ` · ${durationLabel}` : ''}
          </ThemedText>
          <ThemedText style={{ color: theme.textSecondary, fontSize: 11 }}>
            {formatTime(item.createdAt)}
          </ThemedText>
        </Pressable>
      );
    }

    const rawDisplayContent = isOwn && (item.status === 'sending' || item.status === 'queued')
      ? item.content
      : (decryptedCache[item.id] ?? tryDecrypt(item.content, item.id));

    // Phase 2 build 62 — if the decrypted body is an encrypted-media envelope,
    // surface it as a media bubble rather than printing the raw __SC_MEDIA_V1__
    // JSON. Envelope-bubbles never carry plaintext mediaUrl/mediaType from the
    // server, so we synthesize hasMedia from the envelope's mt field instead.
    const mediaEnvelope: MediaEnvelope | null = parseMediaEnvelope(rawDisplayContent);
    const envelopeLocalUri = mediaEnvelope ? decryptedMediaUris[item.id] : null;
    const effectiveMediaUrl = mediaEnvelope ? envelopeLocalUri : item.mediaUrl;
    const effectiveMediaType = mediaEnvelope ? mediaEnvelope.mt : item.mediaType;
    const hasMedia = !!(effectiveMediaUrl && effectiveMediaType);
    // A status reply carries its quote inside the ciphertext (see
    // statusReplyEnvelope.ts) — mutually exclusive with a media envelope,
    // so only check for one if the other didn't match.
    const statusReply = mediaEnvelope ? null : parseStatusReplyEnvelope(rawDisplayContent);
    // Hide the envelope JSON itself from the text-bubble path; if no caption
    // was attached, displayContent ends up null and the text block is skipped.
    const displayContent = mediaEnvelope ? null : (statusReply ? statusReply.text : rawDisplayContent);

    const isSaved = savedMessageIds.has(item.id);

    const handlePress = () => {
      if (isSelectMode) {
        toggleMessageSelection(item.id);
        return;
      }
      // Tap a saved (highlighted) bubble to unsave it — saving itself only
      // happens through the hold menu, so a plain tap never saves.
      if (isSaved) {
        handleToggleSaveMessage(item.id);
      }
    };

    return (
      <Pressable
        onPress={handlePress}
        style={[
          styles.messageWrapper,
          isOwn ? styles.ownMessageWrapper : styles.otherMessageWrapper,
          isSelectMode && styles.selectModeWrapper,
        ]}
      >
        {isSelectMode ? (
          <View style={[styles.selectionCheckbox, { borderColor: theme.primary }]}>
            {isSelected ? (
              <View style={[styles.selectionCheckboxInner, { backgroundColor: theme.primary }]}>
                <Feather name="check" size={14} color="#fff" />
              </View>
            ) : null}
          </View>
        ) : null}
        <View
          ref={(r) => { bubbleRefs.current.set(item.id, r); }}
          collapsable={false}
        >
        <Pressable
          onPress={handlePress}
          onLongPress={() => handleLongPressMessage(item)}
          delayLongPress={350}
          style={[
            styles.messageBubble,
            isOwn ? styles.ownBubble : styles.otherBubble,
            {
              backgroundColor: isOwn ? theme.primary : theme.backgroundSecondary,
            },
            isSaved && { borderWidth: 2, borderColor: '#FFD60A' },
            isSelected && { opacity: 0.8 },
            // Disable native browser text-selection / iOS callout on long-press.
            Platform.OS === 'web' && ({
              userSelect: 'none',
              WebkitUserSelect: 'none',
              WebkitTouchCallout: 'none',
              msUserSelect: 'none',
              cursor: 'pointer',
            } as any),
          ]}
        >
          {/* Envelope present but ciphertext still downloading/decrypting,
              or terminal error with retry. Note: mediaFetchTick is read here
              so the bubble re-renders when the state machine flips. */}
          {mediaEnvelope && !envelopeLocalUri ? (
            (() => {
              void mediaFetchTick;
              const fetchState = mediaFetchState.current.get(item.id);
              if (fetchState === 'error') {
                return (
                  <View style={[styles.mediaContainer, { padding: Spacing.md, alignItems: 'center' }]}>
                    <Feather name="alert-circle" size={20} color={isOwn ? '#fff' : theme.primary} />
                    <ThemedText style={{ color: isOwn ? 'rgba(255,255,255,0.9)' : theme.textSecondary, fontSize: 12, marginTop: 6 }}>
                      Encrypted media unavailable
                    </ThemedText>
                    <Pressable
                      onPress={() => retryEnvelopeMedia(item.id, mediaEnvelope)}
                      style={{ marginTop: 8, paddingHorizontal: 12, paddingVertical: 6, borderRadius: BorderRadius.md, backgroundColor: isOwn ? 'rgba(255,255,255,0.2)' : theme.primary }}
                    >
                      <ThemedText style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>Retry</ThemedText>
                    </Pressable>
                  </View>
                );
              }
              return (
                <View style={[styles.mediaContainer, { padding: Spacing.md, alignItems: 'center' }]}>
                  <ActivityIndicator color={isOwn ? '#fff' : theme.primary} />
                  <ThemedText style={{ color: isOwn ? 'rgba(255,255,255,0.85)' : theme.textSecondary, fontSize: 12, marginTop: 6 }}>
                    Decrypting media…
                  </ThemedText>
                </View>
              );
            })()
          ) : null}

          {hasMedia && (effectiveMediaType === 'image' || effectiveMediaType === 'gif') && effectiveMediaUrl ? (
            // contentFit="contain" (not "cover") -- the box below is a fixed
            // square, and "cover" scales+crops non-square media to fill it,
            // silently cutting off edges. Most GIFs are wide/landscape, so
            // this was cropping roughly half of every GIF sent. "contain"
            // guarantees the whole image is always visible; any letterboxing
            // is filled with the bubble's own background so it blends in
            // rather than showing as a visible gap.
            <View style={[styles.mediaContainer, { backgroundColor: isOwn ? theme.primary : theme.backgroundSecondary }]}>
              <Image
                source={{ uri: effectiveMediaUrl }}
                style={styles.mediaImage}
                contentFit="contain"
              />
            </View>
          ) : null}
          
          {hasMedia && effectiveMediaType === 'video' ? (
            <View style={styles.mediaContainer}>
              <View style={[styles.videoPlaceholder, { backgroundColor: theme.backgroundDefault }]}>
                <Feather name="play-circle" size={40} color={theme.primary} />
              </View>
            </View>
          ) : null}
          
          {hasMedia && effectiveMediaType === 'audio' && effectiveMediaUrl ? (
            <View>
              <View style={styles.voiceMessageContainer}>
                <Pressable 
                  style={[styles.playButton, { backgroundColor: isOwn ? 'rgba(255,255,255,0.2)' : theme.primary }]}
                  onPress={() => playVoiceMessage(item.id, effectiveMediaUrl!)}
                >
                  <Feather 
                    name={playingMessageId === item.id ? "pause" : "play"} 
                    size={16} 
                    color="#fff" 
                  />
                </Pressable>
                <View style={styles.waveformPlaceholder}>
                  {[...Array(20)].map((_, i) => (
                    <View
                      key={i}
                      style={[
                        styles.waveformBar,
                        {
                          height: 8 + Math.random() * 16,
                          backgroundColor: isOwn ? 'rgba(255,255,255,0.5)' : theme.textSecondary,
                          opacity: playingMessageId === item.id ? 1 : 0.6,
                        },
                      ]}
                    />
                  ))}
                </View>
                <ThemedText style={[styles.voiceDuration, { color: isOwn ? 'rgba(255,255,255,0.8)' : theme.textSecondary }]}>
                  {displayContent || '0:00'}
                </ThemedText>
              </View>
              {item.transcription ? (
                <ThemedText style={[styles.transcriptionText, { color: isOwn ? 'rgba(255,255,255,0.9)' : theme.text }]}>
                  {item.transcription}
                </ThemedText>
              ) : null}
            </View>
          ) : null}

          {hasMedia && effectiveMediaType === 'file' && effectiveMediaUrl ? (
            <Pressable
              style={[styles.fileBubble, { backgroundColor: isOwn ? 'rgba(255,255,255,0.15)' : theme.backgroundDefault }]}
              onPress={() => handleOpenFile(effectiveMediaUrl, mediaEnvelope?.name || 'file')}
            >
              <View style={[styles.fileIconWrap, { backgroundColor: isOwn ? 'rgba(255,255,255,0.2)' : theme.primary }]}>
                <Feather name="file-text" size={20} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText numberOfLines={1} style={{ color: isOwn ? '#fff' : theme.text, fontWeight: '600' }}>
                  {mediaEnvelope?.name || 'File'}
                </ThemedText>
                <ThemedText style={{ color: isOwn ? 'rgba(255,255,255,0.7)' : theme.textSecondary, fontSize: 12 }}>
                  {mediaEnvelope?.size ? `${(mediaEnvelope.size / 1024).toFixed(0)} KB · ` : ''}Tap to open
                </ThemedText>
              </View>
            </Pressable>
          ) : null}

          {item.forwarded ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4, opacity: 0.7 }}>
              <Feather name="corner-up-right" size={12} color={isOwn ? "rgba(255,255,255,0.85)" : theme.textSecondary} />
              <ThemedText style={{ marginLeft: 4, fontSize: 11, fontStyle: 'italic', color: isOwn ? "rgba(255,255,255,0.85)" : theme.textSecondary }}>
                Forwarded
              </ThemedText>
            </View>
          ) : null}

          {statusReply ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                borderLeftWidth: 3,
                borderLeftColor: isOwn ? 'rgba(255,255,255,0.7)' : theme.primary,
                paddingLeft: 8,
                paddingVertical: 4,
                marginBottom: 6,
                backgroundColor: isOwn ? 'rgba(255,255,255,0.12)' : theme.backgroundDefault,
                borderRadius: 6,
                gap: 8,
              }}
            >
              {statusReply.quote.mediaUrl ? (
                <Image source={{ uri: statusReply.quote.mediaUrl }} style={{ width: 32, height: 32, borderRadius: 5 }} contentFit="cover" />
              ) : (
                <Feather name={statusReply.quote.mediaType === 'video' ? 'video' : 'image'} size={16} color={isOwn ? '#fff' : theme.textSecondary} />
              )}
              <View style={{ flex: 1 }}>
                <ThemedText style={{ fontSize: 11, fontWeight: '700', color: isOwn ? '#fff' : theme.primary }}>
                  Replied to {statusReply.quote.posterName}'s status
                </ThemedText>
                {statusReply.quote.caption ? (
                  <ThemedText numberOfLines={1} style={{ fontSize: 12, color: isOwn ? 'rgba(255,255,255,0.85)' : theme.textSecondary, marginTop: 1 }}>
                    {statusReply.quote.caption}
                  </ThemedText>
                ) : null}
              </View>
            </View>
          ) : null}

          {item.replyToMessageId ? (() => {
            const original = messages.find(m => m.id === item.replyToMessageId);
            const localPreview = decryptedCache[item.replyToMessageId]
              ?? (original ? tryDecrypt(original.content, original.id) : null)
              ?? (original?.mediaType ? `[${original.mediaType}]` : null)
              ?? "Original message unavailable";
            return (
              <Pressable
                onPress={() => handleScrollToMessage(item.replyToMessageId!)}
                style={{
                  borderLeftWidth: 3,
                  borderLeftColor: isOwn ? 'rgba(255,255,255,0.7)' : theme.primary,
                  paddingLeft: 8,
                  paddingVertical: 4,
                  marginBottom: 6,
                  backgroundColor: isOwn ? 'rgba(255,255,255,0.12)' : theme.backgroundDefault,
                  borderRadius: 6,
                }}
              >
                <ThemedText style={{ fontSize: 11, fontWeight: '700', color: isOwn ? '#fff' : theme.primary }}>
                  {item.replyToSenderId === user?.id ? "You" : otherUserName}
                </ThemedText>
                <ThemedText
                  numberOfLines={2}
                  style={{ fontSize: 12, color: isOwn ? 'rgba(255,255,255,0.85)' : theme.textSecondary, marginTop: 1 }}
                >
                  {localPreview}
                </ThemedText>
              </Pressable>
            );
          })() : null}

          {item.deletedForEveryone ? (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Feather name="slash" size={14} color={isOwn ? "rgba(255,255,255,0.7)" : theme.textSecondary} />
              <ThemedText style={{ marginLeft: 6, fontStyle: 'italic', color: isOwn ? "rgba(255,255,255,0.7)" : theme.textSecondary }}>
                This message was deleted
              </ThemedText>
            </View>
          ) : item.isHidden && !user?.isVip ? (
            <View style={styles.hiddenMessage}>
              <Feather name="lock" size={16} color={isOwn ? "rgba(255,255,255,0.7)" : theme.textSecondary} />
              <ThemedText style={[styles.hiddenText, { color: isOwn ? "rgba(255,255,255,0.7)" : theme.textSecondary }]}>
                Hidden message (VIP only)
              </ThemedText>
            </View>
          ) : displayContent && displayContent.startsWith('__SC_CONTACT_V1__') ? (() => {
            // Structured contact card. Parse the JSON payload and render
            // a tappable card with Add-to-Contacts and Call buttons.
            // If parsing fails for any reason, fall back to plain text.
            let contact: { name: string; phone: string } | null = null;
            try {
              const jsonEnd = displayContent.indexOf('\n');
              const jsonStr = displayContent.slice('__SC_CONTACT_V1__'.length, jsonEnd === -1 ? undefined : jsonEnd);
              const parsed = JSON.parse(jsonStr);
              if (parsed?.name && parsed?.phone) contact = { name: String(parsed.name), phone: String(parsed.phone) };
            } catch {}
            if (!contact) {
              return (
                <ThemedText style={[styles.messageText, { color: isOwn ? "#fff" : theme.text }]}>
                  {displayContent.replace(/^__SC_CONTACT_V1__[^\n]*\n?/, '')}
                </ThemedText>
              );
            }
            const initial = (contact.name?.[0] || '?').toUpperCase();
            const onAddContact = async () => {
              if (Platform.OS === 'web') {
                const msg = "Saving contacts works in the Pryvo app on iPhone or Android.";
                if (typeof window !== 'undefined' && window.alert) window.alert(msg);
                return;
              }
              try {
                const Contacts = await import('expo-contacts');
                const perm = await Contacts.requestPermissionsAsync();
                if (perm.status !== 'granted') {
                  Alert.alert('Permission needed', 'Contacts access is required to save this contact.');
                  return;
                }
                const created = await Contacts.addContactAsync({
                  [Contacts.Fields.FirstName]: contact!.name,
                  [Contacts.Fields.PhoneNumbers]: [{ label: 'mobile', number: contact!.phone }],
                  contactType: Contacts.ContactTypes.Person,
                } as any);
                if (created) Alert.alert('Saved', `${contact!.name} added to your contacts.`);
              } catch (err: any) {
                Alert.alert('Could not save contact', err?.message ?? 'Unknown error');
              }
            };
            const onCallContact = async () => {
              try {
                const url = `tel:${contact!.phone.replace(/\s+/g, '')}`;
                const supported = await Linking.canOpenURL(url);
                if (supported) await Linking.openURL(url);
                else Alert.alert('Calling not available', 'This device cannot place phone calls.');
              } catch {}
            };
            const cardBg = isOwn ? 'rgba(255,255,255,0.14)' : theme.backgroundDefault;
            const accent = isOwn ? '#fff' : theme.primary;
            const subColor = isOwn ? 'rgba(255,255,255,0.85)' : theme.textSecondary;
            return (
              <View style={{ borderRadius: 12, backgroundColor: cardBg, padding: 10, minWidth: 220 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: accent, alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                    <ThemedText style={{ color: isOwn ? theme.primary : '#fff', fontWeight: '700' }}>{initial}</ThemedText>
                  </View>
                  <View style={{ flex: 1 }}>
                    <ThemedText style={{ color: isOwn ? '#fff' : theme.text, fontWeight: '600' }} numberOfLines={1}>
                      {contact.name}
                    </ThemedText>
                    <ThemedText style={{ color: subColor, fontSize: 12 }} numberOfLines={1}>
                      {contact.phone}
                    </ThemedText>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', marginTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: isOwn ? 'rgba(255,255,255,0.25)' : theme.border, paddingTop: 8, gap: 8 }}>
                  <Pressable
                    onPress={onAddContact}
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 6, borderRadius: 8, backgroundColor: isOwn ? 'rgba(255,255,255,0.18)' : theme.primary }}
                  >
                    <Feather name="user-plus" size={14} color={isOwn ? '#fff' : '#fff'} />
                    <ThemedText style={{ color: '#fff', marginLeft: 6, fontSize: 13, fontWeight: '600' }}>Add</ThemedText>
                  </Pressable>
                  <Pressable
                    onPress={onCallContact}
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 6, borderRadius: 8, backgroundColor: isOwn ? 'rgba(255,255,255,0.18)' : theme.backgroundSecondary }}
                  >
                    <Feather name="phone" size={14} color={isOwn ? '#fff' : theme.primary} />
                    <ThemedText style={{ color: isOwn ? '#fff' : theme.primary, marginLeft: 6, fontSize: 13, fontWeight: '600' }}>Call</ThemedText>
                  </Pressable>
                </View>
              </View>
            );
          })() : displayContent && /^Location: -?\d+(\.\d+)?, -?\d+(\.\d+)?$/.test(displayContent) ? (() => {
            // One-time location pin, sent as plain "Location: lat, lng" text
            // (see sendOneTimeLocation) — render as a tappable pin card that
            // opens the coordinates in Maps instead of raw text.
            const [latStr, lngStr] = displayContent.slice('Location: '.length).split(', ');
            const lat = latStr;
            const lng = lngStr;
            const onOpenMaps = async () => {
              const url = Platform.OS === 'ios'
                ? `https://maps.apple.com/?ll=${lat},${lng}`
                : `https://www.google.com/maps?q=${lat},${lng}`;
              try {
                await Linking.openURL(url);
              } catch {
                Alert.alert('Could not open Maps', 'Please try again.');
              }
            };
            return (
              <Pressable
                onPress={onOpenMaps}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, backgroundColor: isOwn ? 'rgba(255,255,255,0.14)' : theme.backgroundDefault, padding: 10, minWidth: 200 }}
              >
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: isOwn ? 'rgba(255,255,255,0.2)' : theme.primary, alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="map-pin" size={20} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText style={{ color: isOwn ? '#fff' : theme.text, fontWeight: '600' }}>
                    Location shared
                  </ThemedText>
                  <ThemedText style={{ color: isOwn ? 'rgba(255,255,255,0.75)' : theme.textSecondary, fontSize: 12 }} numberOfLines={1}>
                    {lat}, {lng} · Tap to open in Maps
                  </ThemedText>
                </View>
              </Pressable>
            );
          })() : displayContent ? (
            <ThemedText style={[styles.messageText, { color: isOwn ? "#fff" : theme.text }]}>
              {displayContent}
            </ThemedText>
          ) : null}
          
          <View style={[styles.messageFooter, isOwn ? styles.ownFooter : styles.otherFooter]}>
            <ThemedText style={[styles.timeText, { color: isOwn ? "rgba(255,255,255,0.7)" : theme.textSecondary }]}>
              {formatTime(item.createdAt)}
            </ThemedText>
            {item.status === 'sending' ? (
              <ActivityIndicator size={12} color={isOwn ? "rgba(255,255,255,0.7)" : theme.textSecondary} />
            ) : item.status === 'queued' ? (
              <Feather name="clock" size={12} color={isOwn ? "rgba(255,255,255,0.7)" : theme.textSecondary} />
            ) : item.status === 'failed' ? (
              <AnimatedPressable 
                onPress={() => {
                  setMessages((prev) => prev.filter((m) => m.id !== item.id));
                  setNewMessage(displayContent || '');
                }}
                style={styles.retryButton}
                scaleValue={0.9}
              >
                <Feather name="alert-circle" size={14} color={theme.error} />
              </AnimatedPressable>
            ) : isOwn ? renderStatusTicks(item.status) : null}
          </View>
        </Pressable>
        </View>
        {(() => {
          const msgReactions = reactionsMap[item.id];
          if (!msgReactions) return null;
          const entries = Object.entries(msgReactions).filter(([, users]) => users.length > 0);
          if (entries.length === 0) return null;
          return (
            <View style={[styles.reactionsRow, isOwn ? styles.reactionsRowOwn : styles.reactionsRowOther]}>
              {entries.map(([emoji, users]) => (
                <Pressable
                  key={emoji}
                  style={[styles.reactionBadge, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}
                  onPress={() => {
                    // Tapping an existing reaction badge opens the action sheet
                    // (the emoji reaction bar is disabled for now).
                    setSelectedMessage(item);
                    setShowMessageOptions(true);
                  }}
                >
                  <ThemedText style={styles.reactionEmoji}>{emoji}</ThemedText>
                  {users.length > 1 ? (
                    <ThemedText style={[styles.reactionCount, { color: theme.textSecondary }]}>{users.length}</ThemedText>
                  ) : null}
                </Pressable>
              ))}
            </View>
          );
        })()}
      </Pressable>
    );
  };

  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: () => (
        <View style={styles.headerTitle}>
          <View style={[styles.headerAvatar, { backgroundColor: theme.primary }]}>
            <ThemedText style={styles.headerAvatarText}>
              {otherUserName.charAt(0).toUpperCase()}
            </ThemedText>
          </View>
          <View style={styles.headerInfo}>
            <ThemedText type="body" style={styles.headerName}>
              {otherUserName}
            </ThemedText>
            <View style={styles.onlineIndicator}>
              <View style={[styles.onlineDot, { backgroundColor: "#25D366" }]} />
              <ThemedText style={[styles.onlineText, { color: theme.textSecondary }]}>
                Online
              </ThemedText>
            </View>
          </View>
        </View>
      ),
      headerRight: () => (
        <View style={styles.headerButtons}>
          <HeaderButton
            onPress={() => setShowCallOptions(true)}
          >
            <Feather name="phone" size={22} color={theme.primary} />
          </HeaderButton>
          <HeaderButton
            onPress={() => navigation.navigate("VideoCall", {
              callId: "",
              receiverId: otherUserId,
              receiverName: otherUserName,
            })}
          >
            <Feather name="video" size={22} color={theme.primary} />
          </HeaderButton>
          <HeaderButton onPress={() => setShowChatSettings(true)}>
            <Feather name="more-vertical" size={22} color={theme.primary} />
          </HeaderButton>
        </View>
      ),
    });
  }, [navigation, theme, otherUserName, otherUserId, user?.isVip, setShowCallOptions]);

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.backgroundRoot }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  const chatContent = (
    <>
      <PinnedMessageBanner
        pinnedMessageId={pinnedMessageId}
        messages={messages}
        decryptedCache={decryptedCache}
        tryDecrypt={tryDecrypt}
        theme={theme}
        onPress={handleScrollToMessage}
      />
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messageList}
        showsVerticalScrollIndicator={false}
        onScrollToIndexFailed={() => {}}
        onScrollBeginDrag={() => { if (holdMessage) closeHoldOverlay(); }}
        ListHeaderComponent={
          <View style={styles.encryptionBannerWrapper}>
            <View style={[
              styles.encryptionBanner,
              { backgroundColor: encryptionState === "no_keys" ? "#FF950018" : theme.backgroundSecondary },
            ]}>
              <Feather
                name={encryptionState === "no_keys" ? "unlock" : "lock"}
                size={12}
                color={encryptionState === "no_keys" ? "#FF9500" : theme.textSecondary}
                style={styles.encryptionBannerIcon}
              />
              <ThemedText
                type="small"
                style={[
                  styles.encryptionBannerText,
                  { color: encryptionState === "no_keys" ? "#FF9500" : theme.textSecondary },
                ]}
              >
                {encryptionState === "encrypted"
                  ? "Messages are end-to-end encrypted"
                  : encryptionState === "securing"
                  ? "Setting up encryption..."
                  : encryptionState === "no_keys"
                  ? (queuedTextSends.length + queuedMediaSends.length > 0
                      ? `Recipient hasn't set up encryption keys — ${queuedTextSends.length + queuedMediaSends.length} message${queuedTextSends.length + queuedMediaSends.length === 1 ? '' : 's'} will send once they do`
                      : "Recipient hasn't set up encryption keys")
                  : "Encryption session reset"}
              </ThemedText>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={[styles.emptyIcon, { backgroundColor: chatBackgroundUrl ? 'rgba(0,0,0,0.5)' : theme.backgroundSecondary }]}>
              <Feather name="message-circle" size={40} color={theme.primary} />
            </View>
            <ThemedText type="body" style={[styles.emptyTitle, { color: theme.text }]}>
              Start a conversation
            </ThemedText>
            <ThemedText style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
              Send a message to {otherUserName}
            </ThemedText>
          </View>
        }
      />
    </>
  );

  return (
    <View style={{ flex: 1 }}>
    <KeyboardAvoidingView 
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}
    >
      {chatBackgroundUrl?.startsWith('color:') ? (
        <View style={[styles.backgroundImage, { backgroundColor: chatBackgroundUrl.slice('color:'.length) }]}>
          {chatContent}
        </View>
      ) : chatBackgroundUrl ? (
        <ImageBackground
          source={{ uri: chatBackgroundUrl }}
          style={styles.backgroundImage}
          resizeMode="cover"
        >
          <View style={styles.backgroundOverlay}>
            {chatContent}
          </View>
        </ImageBackground>
      ) : (
        chatContent
      )}

      {isOtherUserTyping ? (
        <View style={[styles.typingIndicator, { backgroundColor: theme.backgroundSecondary }]}>
          <View style={styles.typingDots}>
            <Animated.View style={[styles.typingDot, { backgroundColor: theme.primary }]} />
            <Animated.View style={[styles.typingDot, { backgroundColor: theme.primary, opacity: 0.7 }]} />
            <Animated.View style={[styles.typingDot, { backgroundColor: theme.primary, opacity: 0.4 }]} />
          </View>
          <ThemedText style={[styles.typingText, { color: theme.textSecondary }]}>
            {otherUserName} is typing...
          </ThemedText>
        </View>
      ) : null}
      
      {isRecording ? (
        <View style={[styles.recordingContainer, { backgroundColor: theme.backgroundSecondary, paddingBottom: isKeyboardVisible ? 0 : insets.bottom + Spacing.md }]}>
          <Pressable style={styles.cancelRecordingButton} onPress={cancelVoiceRecording}>
            <Feather name="x" size={24} color={theme.error} />
          </Pressable>
          
          <View style={styles.recordingInfo}>
            <Animated.View style={[styles.recordingDot, { transform: [{ scale: pulseAnim }] }]} />
            <ThemedText style={[styles.recordingTime, { color: theme.text }]}>
              {formatRecordingTime(recordingDuration)}
            </ThemedText>
            <ThemedText style={[styles.recordingLabel, { color: theme.textSecondary }]}>
              Recording...
            </ThemedText>
          </View>
          
          <Pressable style={[styles.stopRecordingButton, { backgroundColor: theme.primary }]} onPress={stopVoiceRecording}>
            <Feather name="square" size={18} color="#fff" />
          </Pressable>
        </View>
      ) : pendingRecordingUri ? (
        <View style={[styles.recordingContainer, { backgroundColor: theme.backgroundSecondary, paddingBottom: isKeyboardVisible ? 0 : insets.bottom + Spacing.md }]}>
          <Pressable style={styles.deletePreviewButton} onPress={deletePreviewRecording}>
            <Feather name="trash-2" size={22} color={theme.error} />
          </Pressable>
          
          <View style={styles.previewInfo}>
            <Pressable style={[styles.playPreviewButton, { backgroundColor: theme.primary }]} onPress={playPreviewRecording}>
              <Feather name={isPlayingPreview ? "pause" : "play"} size={20} color="#fff" />
            </Pressable>
            <View style={styles.previewWaveform}>
              {[...Array(20)].map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.waveformBar,
                    {
                      height: 4 + Math.random() * 16,
                      backgroundColor: theme.primary,
                      opacity: isPlayingPreview ? 1 : 0.5,
                    },
                  ]}
                />
              ))}
            </View>
            <ThemedText style={[styles.previewDuration, { color: theme.text }]}>
              {formatRecordingTime(pendingRecordingDuration)}
            </ThemedText>
          </View>
          
          <Pressable 
            style={[styles.sendRecordingButton, { backgroundColor: theme.primary }]} 
            onPress={sendPreviewRecording}
            disabled={isSending}
          >
            {isSending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Feather name="send" size={20} color="#fff" />
            )}
          </Pressable>
        </View>
      ) : isSelectMode ? (
        <View style={[styles.selectionToolbar, { backgroundColor: theme.backgroundRoot, paddingBottom: insets.bottom + Spacing.md }]}>
          <Pressable style={styles.selectionToolbarButton} onPress={handleExitSelectMode}>
            <Feather name="x" size={22} color={theme.text} />
            <ThemedText type="small" style={{ color: theme.text, marginTop: 2 }}>Cancel</ThemedText>
          </Pressable>
          
          <ThemedText type="body" style={{ color: theme.text, fontWeight: '600' }}>
            {selectedMessageIds.size} selected
          </ThemedText>
          
          <View style={styles.selectionActions}>
            <Pressable 
              style={styles.selectionToolbarButton} 
              onPress={handleCopySelected}
              disabled={selectedMessageIds.size === 0}
            >
              <Feather name="copy" size={22} color={selectedMessageIds.size > 0 ? theme.primary : theme.textSecondary} />
              <ThemedText type="small" style={{ color: selectedMessageIds.size > 0 ? theme.primary : theme.textSecondary, marginTop: 2 }}>Copy</ThemedText>
            </Pressable>
            
            <Pressable 
              style={styles.selectionToolbarButton} 
              onPress={handleShareSelected}
              disabled={selectedMessageIds.size === 0}
            >
              <Feather name="share" size={22} color={selectedMessageIds.size > 0 ? theme.primary : theme.textSecondary} />
              <ThemedText type="small" style={{ color: selectedMessageIds.size > 0 ? theme.primary : theme.textSecondary, marginTop: 2 }}>Share</ThemedText>
            </Pressable>
            
            <Pressable 
              style={styles.selectionToolbarButton} 
              onPress={handleDeleteSelected}
              disabled={selectedMessageIds.size === 0}
            >
              <Feather name="trash-2" size={22} color={selectedMessageIds.size > 0 ? theme.error : theme.textSecondary} />
              <ThemedText type="small" style={{ color: selectedMessageIds.size > 0 ? theme.error : theme.textSecondary, marginTop: 2 }}>Delete</ThemedText>
            </Pressable>
          </View>
        </View>
      ) : (isBlockedByMe || isBlockedByThem) ? (
        <View style={[styles.blockedBanner, { backgroundColor: theme.backgroundRoot, paddingBottom: isKeyboardVisible ? 0 : insets.bottom + Spacing.md }]}>
          <Feather name="slash" size={20} color={theme.textSecondary} />
          <ThemedText type="body" style={{ color: theme.textSecondary, marginLeft: Spacing.sm }}>
            {isBlockedByMe 
              ? "You blocked this user" 
              : "You can't reply to this conversation"}
          </ThemedText>
          {isBlockedByMe ? (
            <Pressable 
              style={[styles.unblockButton, { backgroundColor: theme.primary }]}
              onPress={handleBlockUser}
            >
              <ThemedText type="small" style={{ color: "#fff" }}>Unblock</ThemedText>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <View style={[styles.inputContainer, { backgroundColor: theme.backgroundRoot, paddingBottom: isKeyboardVisible ? 0 : insets.bottom + Spacing.md }]}>
          {/*
            Build 63 Phase A — sealed-sender identity surface. Renders
            only in app mode so personal-number users see no extra UI.
            Three states:
              · active VN  + recipient supports sealed: lock badge +
                "End-to-end encrypted · sender identity not sent"
              · active VN  + recipient on old build:   lock badge +
                "End-to-end encrypted" (no sealed-sender claim)
              · VN not active: amber banner explaining why the composer
                is disabled.
          */}
          {user?.preferredNumberType === 'app' ? (
            user?.virtualNumber && user.virtualNumber.status === 'active' ? (
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: Spacing.md,
                paddingTop: Spacing.xs,
                paddingBottom: 2,
                gap: 6,
              }}>
                <Feather name="lock" size={11} color={theme.textSecondary} />
                <ThemedText
                  numberOfLines={1}
                  style={{ fontSize: 11, color: theme.textSecondary, flex: 1 }}
                >
                  {otherUserData?.supportsSealedSender
                    ? 'End-to-end encrypted · sender identity not sent to recipient'
                    : 'End-to-end encrypted'}
                </ThemedText>
              </View>
            ) : (
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: Spacing.md,
                paddingVertical: Spacing.xs,
                gap: 6,
              }}>
                <Feather name="alert-triangle" size={12} color="#b8860b" />
                <ThemedText
                  numberOfLines={2}
                  style={{ fontSize: 11, color: theme.textSecondary, flex: 1 }}
                >
                  Your virtual number is not active. Sending is disabled until it is restored.
                </ThemedText>
              </View>
            )
          ) : null}
          {statusQuote ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                marginHorizontal: Spacing.md,
                marginBottom: Spacing.xs,
                padding: Spacing.sm,
                borderRadius: BorderRadius.md,
                backgroundColor: theme.backgroundSecondary,
                borderLeftWidth: 3,
                borderLeftColor: theme.primary,
                gap: Spacing.sm,
              }}
            >
              {statusQuote.mediaUrl ? (
                <Image source={{ uri: statusQuote.mediaUrl }} style={{ width: 36, height: 36, borderRadius: 6 }} contentFit="cover" />
              ) : (
                <View style={{ width: 36, height: 36, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.backgroundDefault }}>
                  <Feather name={statusQuote.mediaType === 'video' ? 'video' : 'image'} size={16} color={theme.textSecondary} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <ThemedText style={{ fontSize: 12, fontWeight: '700', color: theme.primary }}>
                  Replying to {statusQuote.posterName}'s status
                </ThemedText>
                {statusQuote.caption ? (
                  <ThemedText numberOfLines={1} style={{ fontSize: 12, color: theme.textSecondary }}>
                    {statusQuote.caption}
                  </ThemedText>
                ) : null}
              </View>
              <Pressable onPress={() => setStatusQuote(null)} hitSlop={8}>
                <Feather name="x" size={18} color={theme.textSecondary} />
              </Pressable>
            </View>
          ) : null}
          <ReplyPreviewBar
            replyTo={replyTo}
            currentUserId={user?.id}
            otherUserName={otherUserName}
            decryptedCache={decryptedCache}
            tryDecrypt={tryDecrypt}
            theme={theme}
            onClose={() => setReplyTo(null)}
          />
          <View style={styles.inputRow}>
            <Pressable
              style={[
                styles.attachButton,
                {
                  backgroundColor: theme.backgroundSecondary,
                  opacity: vnInactive ? 0.4 : 1,
                },
              ]}
              onPress={() => {
                if (guardVnInactive()) return;
                setShowAttachmentMenu(true);
              }}
            >
              <Feather name="plus" size={22} color={theme.primary} />
            </Pressable>
            
            <View style={[styles.inputWrapper, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}>
              <TextInput
                style={[
                  styles.input,
                  { color: theme.text },
                  Platform.OS === 'web' ? ({ outlineStyle: 'none', outlineWidth: 0 } as any) : null,
                ]}
                placeholder="Message"
                placeholderTextColor={theme.textSecondary}
                value={newMessage}
                onChangeText={handleTextChange}
                multiline
                maxLength={1000}
                underlineColorAndroid="transparent"
                selectionColor={theme.primary}
                cursorColor={theme.primary}
                textAlignVertical="top"
              />
            </View>

            <AnimatedPressable
              style={[styles.inputActionButton, { opacity: vnInactive ? 0.4 : 1 }]}
              onPress={() => {
                if (guardVnInactive()) return;
                handleTakePhoto();
              }}
              hitSlop={10}
              scaleValue={0.85}
              hapticType="light"
            >
              <Feather name="camera" size={22} color={theme.textSecondary} />
            </AnimatedPressable>
            
            {newMessage.trim() ? (
              <AnimatedPressable
                style={[
                  styles.sendButton,
                  {
                    backgroundColor: theme.primary,
                    // Disabled state when the user is in app mode but
                    // their VN is released/suspended. We still render
                    // the icon so the layout doesn't shift, but
                    // `onPress` short-circuits via `guardVnInactive`.
                    opacity: vnInactive ? 0.4 : 1,
                  },
                ]}
                onPress={() => {
                  if (guardVnInactive()) return;
                  handleSend();
                }}
                disabled={isSending}
                scaleValue={0.85}
                hapticType="light"
              >
                {isSending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Feather name="send" size={20} color="#fff" />
                )}
              </AnimatedPressable>
            ) : (
              <AnimatedPressable
                style={[
                  styles.voiceButton,
                  {
                    backgroundColor: theme.backgroundSecondary,
                    opacity: vnInactive ? 0.4 : 1,
                  },
                ]}
                onPress={() => {
                  if (guardVnInactive()) return;
                  startVoiceRecording();
                }}
                hitSlop={12}
                scaleValue={0.85}
                hapticType="light"
              >
                <Feather name="mic" size={22} color={theme.textSecondary} />
              </AnimatedPressable>
            )}
          </View>
        </View>
      )}

      <Modal
        visible={false /* Emoji reaction bar disabled — long-press opens action sheet directly */ && reactionPickerMessageId !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setReactionPickerMessageId(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setReactionPickerMessageId(null)}>
          <View style={[styles.reactionPickerContainer, { backgroundColor: theme.backgroundSecondary, paddingBottom: insets.bottom + Spacing.md }]}>
            <View style={styles.reactionPickerRow}>
              {['❤️', '👍', '😂', '😮', '😢', '🙏'].map(emoji => (
                <Pressable
                  key={emoji}
                  style={styles.reactionPickerEmoji}
                  onPress={() => handleReact(emoji)}
                >
                  <ThemedText style={styles.reactionPickerEmojiText}>{emoji}</ThemedText>
                </Pressable>
              ))}
              <Pressable
                style={[styles.reactionPickerMore, { backgroundColor: theme.backgroundDefault }]}
                onPress={() => {
                  setReactionPickerMessageId(null);
                  setShowMessageOptions(true);
                }}
              >
                <Feather name="more-horizontal" size={20} color={theme.textSecondary} />
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={showAttachmentMenu}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAttachmentMenu(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowAttachmentMenu(false)}>
          <View style={[styles.attachmentMenu, { backgroundColor: theme.backgroundSecondary, paddingBottom: insets.bottom + Spacing.lg }]}>
            <View style={styles.attachmentHeader}>
              <ThemedText style={[styles.attachmentTitle, { color: theme.text }]}>
                Share Content
              </ThemedText>
              <Pressable onPress={() => setShowAttachmentMenu(false)}>
                <Feather name="x" size={24} color={theme.textSecondary} />
              </Pressable>
            </View>
            
            <View style={styles.attachmentGrid}>
              <Pressable style={styles.attachmentOption} onPress={handlePickPhotos}>
                <View style={[styles.attachmentIcon, { backgroundColor: '#4ECDC4' }]}>
                  <Feather name="image" size={24} color="#fff" />
                </View>
                <ThemedText style={[styles.attachmentLabel, { color: theme.text }]}>
                  Photos
                </ThemedText>
              </Pressable>
              
              <Pressable style={styles.attachmentOption} onPress={handleOpenEmojiPicker}>
                <View style={[styles.attachmentIcon, { backgroundColor: '#FFD93D' }]}>
                  <Feather name="smile" size={24} color="#fff" />
                </View>
                <ThemedText style={[styles.attachmentLabel, { color: theme.text }]}>
                  Emoji
                </ThemedText>
              </Pressable>
              
              <Pressable style={styles.attachmentOption} onPress={handleShareLocation}>
                <View style={[styles.attachmentIcon, { backgroundColor: '#F39C12' }]}>
                  <Feather name={user?.isVip ? "navigation" : "map-pin"} size={24} color="#fff" />
                </View>
                <ThemedText style={[styles.attachmentLabel, { color: theme.text }]}>
                  Location
                </ThemedText>
              </Pressable>
              
              <Pressable style={styles.attachmentOption} onPress={handleShareContact}>
                <View style={[styles.attachmentIcon, { backgroundColor: '#1ABC9C' }]}>
                  <Feather name="user" size={24} color="#fff" />
                </View>
                <ThemedText style={[styles.attachmentLabel, { color: theme.text }]}>
                  Contact
                </ThemedText>
              </Pressable>
              
              <Pressable style={styles.attachmentOption} onPress={() => { setShowAttachmentMenu(false); setShowGifPicker(true); }}>
                <View style={[styles.attachmentIcon, { backgroundColor: '#E91E63' }]}>
                  <ThemedText style={{ fontSize: 18, fontWeight: 'bold', color: '#fff' }}>GIF</ThemedText>
                </View>
                <ThemedText style={[styles.attachmentLabel, { color: theme.text }]}>
                  GIF
                </ThemedText>
              </Pressable>

              <Pressable style={styles.attachmentOption} onPress={handlePickFile}>
                <View style={[styles.attachmentIcon, { backgroundColor: '#9B59B6' }]}>
                  <Feather name="file-text" size={24} color="#fff" />
                </View>
                <ThemedText style={[styles.attachmentLabel, { color: theme.text }]}>
                  File
                </ThemedText>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={showContactPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowContactPicker(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowContactPicker(false)}>
          <Pressable
            style={[styles.contactPickerContainer, { backgroundColor: theme.backgroundDefault, paddingBottom: insets.bottom + Spacing.md }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.attachmentHeader}>
              <ThemedText style={[styles.attachmentTitle, { color: theme.text }]}>
                Share Contact{selectedContactIds.size > 0 ? ` (${selectedContactIds.size})` : ''}
              </ThemedText>
              <Pressable onPress={() => setShowContactPicker(false)}>
                <Feather name="x" size={24} color={theme.textSecondary} />
              </Pressable>
            </View>

            <View style={[styles.contactSearchWrap, { backgroundColor: theme.backgroundSecondary }]}>
              <Feather name="search" size={16} color={theme.textSecondary} />
              <TextInput
                style={[styles.contactSearchInput, { color: theme.text }]}
                placeholder="Search contacts"
                placeholderTextColor={theme.textSecondary}
                value={contactSearch}
                onChangeText={setContactSearch}
                autoCorrect={false}
              />
            </View>

            {contactsLoading ? (
              <ActivityIndicator size="large" color={theme.primary} style={{ marginTop: Spacing.xl }} />
            ) : (
              <FlatList
                data={deviceContacts.filter((c) => {
                  const q = contactSearch.trim().toLowerCase();
                  if (!q) return true;
                  return c.name.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q);
                })}
                keyExtractor={(item) => item.id}
                style={{ maxHeight: 380 }}
                keyboardShouldPersistTaps="handled"
                ListEmptyComponent={
                  <View style={{ padding: Spacing.xl, alignItems: 'center' }}>
                    <ThemedText style={{ color: theme.textSecondary }}>
                      No contacts found
                    </ThemedText>
                  </View>
                }
                renderItem={({ item }) => {
                  const selected = selectedContactIds.has(item.id);
                  return (
                    <Pressable
                      style={[styles.contactRow, { borderBottomColor: theme.border }]}
                      onPress={() => {
                        setSelectedContactIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(item.id)) next.delete(item.id);
                          else next.add(item.id);
                          return next;
                        });
                      }}
                    >
                      <View style={[styles.contactAvatar, { backgroundColor: theme.primary }]}>
                        <ThemedText style={styles.contactAvatarText}>
                          {(item.name?.[0] || '?').toUpperCase()}
                        </ThemedText>
                      </View>
                      <View style={{ flex: 1 }}>
                        <ThemedText style={{ color: theme.text, fontWeight: '500' }} numberOfLines={1}>
                          {item.name}
                        </ThemedText>
                        <ThemedText style={{ color: theme.textSecondary, fontSize: 13 }} numberOfLines={1}>
                          {item.phone}
                        </ThemedText>
                      </View>
                      <View style={[
                        styles.contactCheck,
                        { borderColor: selected ? theme.primary : theme.border, backgroundColor: selected ? theme.primary : 'transparent' },
                      ]}>
                        {selected ? <Feather name="check" size={14} color="#fff" /> : null}
                      </View>
                    </Pressable>
                  );
                }}
              />
            )}

            <Pressable
              style={[
                styles.contactSendBtn,
                { backgroundColor: selectedContactIds.size > 0 ? theme.primary : theme.backgroundSecondary, opacity: selectedContactIds.size > 0 ? 1 : 0.6 },
              ]}
              disabled={selectedContactIds.size === 0}
              onPress={sendSelectedContacts}
            >
              <ThemedText style={{ color: '#fff', fontWeight: '600' }}>
                Send {selectedContactIds.size > 0 ? `(${selectedContactIds.size})` : ''}
              </ThemedText>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={showEmojiPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowEmojiPicker(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowEmojiPicker(false)}>
          <Pressable style={[styles.emojiPickerContainer, { backgroundColor: theme.backgroundSecondary, paddingBottom: insets.bottom + Spacing.lg }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.attachmentHeader}>
              <ThemedText style={[styles.attachmentTitle, { color: theme.text }]}>
                Emojis
              </ThemedText>
              <Pressable onPress={() => setShowEmojiPicker(false)}>
                <Feather name="x" size={24} color={theme.textSecondary} />
              </Pressable>
            </View>
            
            <View style={styles.emojiCategoryTabs}>
              {(Object.keys(emojiCategories) as Array<keyof typeof emojiCategories>).map((category) => (
                <Pressable
                  key={category}
                  style={[
                    styles.emojiCategoryTab,
                    selectedEmojiCategory === category && { backgroundColor: theme.primary + '20' }
                  ]}
                  onPress={() => setSelectedEmojiCategory(category)}
                >
                  <ThemedText style={[
                    styles.emojiCategoryLabel,
                    { color: selectedEmojiCategory === category ? theme.primary : theme.textSecondary }
                  ]}>
                    {category === 'smileys' ? '😀' : 
                     category === 'gestures' ? '👋' :
                     category === 'hearts' ? '❤️' :
                     category === 'animals' ? '🐶' :
                     category === 'food' ? '🍎' :
                     category === 'activities' ? '⚽' :
                     category === 'objects' ? '💡' : '✨'}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
            
            <FlatList
              data={emojiCategories[selectedEmojiCategory]}
              numColumns={8}
              keyExtractor={(item, index) => `${item}-${index}`}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.emojiItem}
                  onPress={() => handleEmojiSelect(item)}
                >
                  <ThemedText style={styles.emojiText}>{item}</ThemedText>
                </Pressable>
              )}
              contentContainerStyle={styles.emojiGrid}
              showsVerticalScrollIndicator={false}
            />
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={showMessageOptions}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMessageOptions(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowMessageOptions(false)}
        >
          <View style={[styles.messageOptionsContainer, { backgroundColor: theme.backgroundRoot }]}>
            <View style={styles.messageOptionsHandle}>
              <View style={[styles.handleBar, { backgroundColor: theme.border }]} />
            </View>
            
            <ThemedText type="h3" style={styles.messageOptionsTitle}>
              Message Options
            </ThemedText>

            {/* 1. Reply */}
            <Pressable
              style={[styles.messageOption, { backgroundColor: theme.backgroundDefault }]}
              onPress={handleReplyToMessage}
            >
              <View style={[styles.messageOptionIcon, { backgroundColor: theme.primary }]}>
                <Feather name="corner-up-left" size={20} color="#fff" />
              </View>
              <View style={styles.messageOptionText}>
                <ThemedText type="body" style={{ fontWeight: "600" }}>Reply</ThemedText>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  Quote this message in your reply
                </ThemedText>
              </View>
            </Pressable>

            {/* 2. Forward */}
            <Pressable
              style={[styles.messageOption, { backgroundColor: theme.backgroundDefault }]}
              onPress={handleForwardMessage}
            >
              <View style={[styles.messageOptionIcon, { backgroundColor: '#5856D6' }]}>
                <Feather name="corner-up-right" size={20} color="#fff" />
              </View>
              <View style={styles.messageOptionText}>
                <ThemedText type="body" style={{ fontWeight: "600" }}>Forward</ThemedText>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  Send to another conversation
                </ThemedText>
              </View>
            </Pressable>

            {/* 3. Copy */}
            {selectedMessage?.content ? (
              <Pressable
                style={[styles.messageOption, { backgroundColor: theme.backgroundDefault }]}
                onPress={handleCopyMessage}
              >
                <View style={[styles.messageOptionIcon, { backgroundColor: theme.primary }]}>
                  <Feather name="copy" size={20} color="#fff" />
                </View>
                <View style={styles.messageOptionText}>
                  <ThemedText type="body" style={{ fontWeight: "600" }}>Copy</ThemedText>
                  <ThemedText type="small" style={{ color: theme.textSecondary }}>
                    Copy message text to clipboard
                  </ThemedText>
                </View>
              </Pressable>
            ) : null}

            {/* 4. Select */}
            <Pressable
              style={[styles.messageOption, { backgroundColor: theme.backgroundDefault }]}
              onPress={() => selectedMessage && handleEnterSelectMode(selectedMessage)}
            >
              <View style={[styles.messageOptionIcon, { backgroundColor: '#8E8E93' }]}>
                <Feather name="check-square" size={20} color="#fff" />
              </View>
              <View style={styles.messageOptionText}>
                <ThemedText type="body" style={{ fontWeight: "600" }}>Select</ThemedText>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  Select multiple messages
                </ThemedText>
              </View>
            </Pressable>

            {/* 5. Pin */}
            <Pressable
              style={[styles.messageOption, { backgroundColor: theme.backgroundDefault }]}
              onPress={handlePinMessage}
            >
              <View style={[styles.messageOptionIcon, { backgroundColor: '#FFCC00' }]}>
                <Feather name={pinnedMessageId === selectedMessage?.id ? "x" : "bookmark"} size={20} color="#fff" />
              </View>
              <View style={styles.messageOptionText}>
                <ThemedText type="body" style={{ fontWeight: "600" }}>
                  {pinnedMessageId === selectedMessage?.id ? "Unpin" : "Pin"}
                </ThemedText>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  {pinnedMessageId === selectedMessage?.id
                    ? "Remove from the pinned banner"
                    : "Pin to the top of this chat"}
                </ThemedText>
              </View>
            </Pressable>

            {/* 6. Message Info */}
            <Pressable
              style={[styles.messageOption, { backgroundColor: theme.backgroundDefault }]}
              onPress={handleShowMessageInfo}
            >
              <View style={[styles.messageOptionIcon, { backgroundColor: '#5AC8FA' }]}>
                <Feather name="info" size={20} color="#fff" />
              </View>
              <View style={styles.messageOptionText}>
                <ThemedText type="body" style={{ fontWeight: "600" }}>Message Info</ThemedText>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  Sent, delivered, read & encryption
                </ThemedText>
              </View>
            </Pressable>

            {/* Secondary actions (only shown when relevant) */}
            <Pressable
              style={[styles.messageOption, { backgroundColor: theme.backgroundDefault }]}
              onPress={handleShareMessage}
            >
              <View style={[styles.messageOptionIcon, { backgroundColor: '#34C759' }]}>
                <Feather name="share" size={20} color="#fff" />
              </View>
              <View style={styles.messageOptionText}>
                <ThemedText type="body" style={{ fontWeight: "600" }}>Share</ThemedText>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  Share with other apps
                </ThemedText>
              </View>
            </Pressable>

            {selectedMessage && selectedMessage.senderId !== user?.id ? (
              <Pressable
                style={[styles.messageOption, { backgroundColor: theme.backgroundDefault }]}
                onPress={handleReportMessage}
              >
                <View style={[styles.messageOptionIcon, { backgroundColor: '#FF9500' }]}>
                  <Feather name="flag" size={20} color="#fff" />
                </View>
                <View style={styles.messageOptionText}>
                  <ThemedText type="body" style={{ fontWeight: "600" }}>Report</ThemedText>
                  <ThemedText type="small" style={{ color: theme.textSecondary }}>
                    Send this message to our moderation team
                  </ThemedText>
                </View>
              </Pressable>
            ) : null}

            {canUnsend(selectedMessage) ? (
              <Pressable
                style={[styles.messageOption, { backgroundColor: theme.backgroundDefault }]}
                onPress={handleUnsendMessage}
              >
                <View style={[styles.messageOptionIcon, { backgroundColor: '#FF9500' }]}>
                  <Feather name="rotate-ccw" size={20} color="#fff" />
                </View>
                <View style={styles.messageOptionText}>
                  <ThemedText type="body" style={{ fontWeight: "600" }}>
                    Unsend
                  </ThemedText>
                  <ThemedText type="small" style={{ color: theme.textSecondary }}>
                    Remove for everyone (within 5 min)
                  </ThemedText>
                </View>
              </Pressable>
            ) : null}

            {user?.isVip ? (
              <Pressable
                style={[styles.messageOption, { backgroundColor: theme.backgroundDefault }]}
                onPress={handleHideToLocker}
              >
                <View style={[styles.messageOptionIcon, { backgroundColor: theme.accent }]}>
                  <Feather name="lock" size={20} color="#fff" />
                </View>
                <View style={styles.messageOptionText}>
                  <ThemedText type="body" style={{ fontWeight: "600" }}>
                    Hide to Locker
                  </ThemedText>
                  <ThemedText type="small" style={{ color: theme.textSecondary }}>
                    Save to your private, PIN-protected vault
                  </ThemedText>
                </View>
              </Pressable>
            ) : null}

            <Pressable
              style={[styles.messageOption, { backgroundColor: theme.backgroundDefault }]}
              onPress={() => {
                setShowMessageOptions(false);
                setShowDeleteSheet(true);
              }}
            >
              <View style={[styles.messageOptionIcon, { backgroundColor: '#FF3B30' }]}>
                <Feather name="trash-2" size={20} color="#fff" />
              </View>
              <View style={styles.messageOptionText}>
                <ThemedText type="body" style={{ fontWeight: "600", color: '#FF3B30' }}>
                  Delete
                </ThemedText>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  Choose delete for me or for everyone
                </ThemedText>
              </View>
            </Pressable>
            
            <Pressable
              style={[styles.messageOption, { backgroundColor: theme.backgroundDefault }]}
              onPress={() => setShowMessageOptions(false)}
            >
              <View style={[styles.messageOptionIcon, { backgroundColor: theme.textSecondary }]}>
                <Feather name="x" size={20} color="#fff" />
              </View>
              <View style={styles.messageOptionText}>
                <ThemedText type="body" style={{ fontWeight: "600" }}>
                  Cancel
                </ThemedText>
              </View>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={showChatSettings}
        transparent
        animationType="slide"
        onRequestClose={() => setShowChatSettings(false)}
      >
        {/* Blurred dim background. Tap-outside-to-dismiss preserved.
            BlurView renders a true frosted-glass effect on iOS, a tinted
            translucent overlay on Android, and falls back gracefully on
            web — so we still get the dim look everywhere. */}
        <Pressable style={styles.chatSettingsBackdrop} onPress={() => setShowChatSettings(false)}>
          <BlurView
            intensity={Platform.OS === "ios" ? 40 : 80}
            tint={isDark ? "dark" : "light"}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.chatSettingsBackdropTint} pointerEvents="none" />

          {/* stopPropagation: tapping the sheet itself shouldn't dismiss. */}
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={[
              styles.chatSettingsMenu,
              {
                backgroundColor: theme.backgroundSecondary,
                paddingBottom: insets.bottom + Spacing.lg,
                borderColor: theme.border,
              },
            ]}
          >
            {/* Drag handle */}
            <View style={styles.chatSettingsHandleWrap}>
              <View style={[styles.chatSettingsHandle, { backgroundColor: theme.border }]} />
            </View>

            <View style={styles.chatSettingsHeader}>
              <ThemedText type="h3" style={{ fontWeight: "700" }}>
                Chat Settings
              </ThemedText>
              <AnimatedPressable
                onPress={() => setShowChatSettings(false)}
                style={[styles.chatSettingsClose, { backgroundColor: theme.backgroundDefault }]}
                hitSlop={8}
              >
                <Feather name="x" size={18} color={theme.textSecondary} />
              </AnimatedPressable>
            </View>

            <ScrollView
              style={{ maxHeight: 520 }}
              contentContainerStyle={styles.settingsOptions}
              showsVerticalScrollIndicator={false}
            >
              {user?.isVip ? (
                <>
                  <AnimatedPressable
                    style={[styles.settingsOption, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}
                    onPress={handleSetChatBackground}
                    disabled={setChatBackgroundMutation.isPending}
                  >
                    <View style={[styles.settingsOptionIcon, { backgroundColor: '#4ECDC4' }]}>
                      {setChatBackgroundMutation.isPending ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Feather name="image" size={20} color="#fff" />
                      )}
                    </View>
                    <View style={styles.settingsOptionText}>
                      <ThemedText type="body" style={{ fontWeight: "600" }} numberOfLines={1}>
                        Set Chat Background
                      </ThemedText>
                      <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: 2 }} numberOfLines={2}>
                        Choose a photo as your chat wallpaper
                      </ThemedText>
                    </View>
                    <Feather name="chevron-right" size={18} color={theme.textSecondary} />
                  </AnimatedPressable>

                  <View style={{ paddingHorizontal: Spacing.md, paddingTop: Spacing.sm }}>
                    <ThemedText type="small" style={{ color: theme.textSecondary, marginBottom: Spacing.sm }}>
                      Or pick a solid color
                    </ThemedText>
                    <View style={{ flexDirection: "row", gap: Spacing.md }}>
                      {CHAT_BACKGROUND_COLORS.map((c) => {
                        const isSelected = chatBackgroundUrl === `color:${c.hex}`;
                        return (
                          <AnimatedPressable
                            key={c.hex}
                            onPress={() => setSolidColorBackgroundMutation.mutate(c.hex)}
                            disabled={setSolidColorBackgroundMutation.isPending}
                            style={[
                              styles.colorSwatch,
                              {
                                backgroundColor: c.hex,
                                borderColor: isSelected ? theme.primary : theme.border,
                                borderWidth: isSelected ? 3 : 1,
                              },
                            ]}
                          >
                            {isSelected ? <Feather name="check" size={16} color="#fff" /> : null}
                          </AnimatedPressable>
                        );
                      })}
                    </View>
                  </View>

                  {chatBackgroundUrl ? (
                    <AnimatedPressable
                      style={[styles.settingsOption, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}
                      onPress={() => {
                        Alert.alert(
                          'Remove Background',
                          'Remove your custom chat background?',
                          [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Remove', style: 'destructive', onPress: () => removeChatBackgroundMutation.mutate() },
                          ]
                        );
                      }}
                      disabled={removeChatBackgroundMutation.isPending}
                    >
                      <View style={[styles.settingsOptionIcon, { backgroundColor: theme.error }]}>
                        {removeChatBackgroundMutation.isPending ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Feather name="x-circle" size={20} color="#fff" />
                        )}
                      </View>
                      <View style={styles.settingsOptionText}>
                        <ThemedText type="body" style={{ fontWeight: "600" }} numberOfLines={1}>
                          Remove Background
                        </ThemedText>
                        <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: 2 }} numberOfLines={2}>
                          Use default chat background
                        </ThemedText>
                      </View>
                      <Feather name="chevron-right" size={18} color={theme.textSecondary} />
                    </AnimatedPressable>
                  ) : null}
                </>
              ) : (
                <View style={[styles.vipUpgradeCard, { backgroundColor: theme.accent + '10', borderColor: theme.accent + '30' }]}>
                  <View style={[styles.vipUpgradeIcon, { backgroundColor: theme.accent }]}>
                    <Feather name="award" size={24} color="#fff" />
                  </View>
                  <ThemedText type="body" style={{ fontWeight: "600", marginTop: Spacing.md }}>
                    VIP Feature
                  </ThemedText>
                  <ThemedText type="small" style={{ color: theme.textSecondary, textAlign: 'center', marginTop: Spacing.xs }}>
                    Custom chat backgrounds are available for VIP members. Upgrade to personalize your chats.
                  </ThemedText>
                  <AnimatedPressable
                    style={[styles.upgradeButton, { backgroundColor: theme.accent }]}
                    onPress={() => {
                      setShowChatSettings(false);
                      navigation.navigate('Settings' as never);
                    }}
                  >
                    <ThemedText type="body" style={{ color: '#fff', fontWeight: '600' }}>
                      Upgrade to VIP
                    </ThemedText>
                  </AnimatedPressable>
                </View>
              )}

              <AnimatedPressable
                style={[styles.settingsOption, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}
                onPress={openConversationTimerPicker}
              >
                <View style={[styles.settingsOptionIcon, { backgroundColor: '#5856D6' }]}>
                  <Feather name="clock" size={20} color="#fff" />
                </View>
                <View style={styles.settingsOptionText}>
                  <ThemedText type="body" style={{ fontWeight: "600" }} numberOfLines={1}>
                    Disappearing Messages
                  </ThemedText>
                  <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: 2 }} numberOfLines={2}>
                    {conversationTimer === 0
                      ? "Off — messages stay until deleted"
                      : conversationTimer === 300 ? "5 minutes"
                      : conversationTimer === 28800 ? "8 hours"
                      : conversationTimer === 43200 ? "12 hours"
                      : conversationTimer === 64800 ? "18 hours"
                      : conversationTimer === 86400 ? "24 hours"
                      : `${Math.round(conversationTimer/60)} min`}
                  </ThemedText>
                </View>
                <Feather name="chevron-right" size={18} color={theme.textSecondary} />
              </AnimatedPressable>

              <AnimatedPressable
                style={[styles.settingsOption, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}
                onPress={handleFriendAction}
                disabled={
                  sendFriendRequestMutation.isPending ||
                  acceptFriendRequestMutation.isPending ||
                  removeFriendMutation.isPending
                }
              >
                <View style={[styles.settingsOptionIcon, { backgroundColor: friendshipStatus?.status === 'friends' ? '#4ECDC4' : '#1ABC9C' }]}>
                  {sendFriendRequestMutation.isPending || acceptFriendRequestMutation.isPending || removeFriendMutation.isPending ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Feather
                      name={
                        friendshipStatus?.status === 'friends' ? 'user-check'
                        : friendshipStatus?.status === 'request_received' ? 'user-plus'
                        : friendshipStatus?.status === 'request_sent' ? 'clock'
                        : 'user-plus'
                      }
                      size={20}
                      color="#fff"
                    />
                  )}
                </View>
                <View style={styles.settingsOptionText}>
                  <ThemedText type="body" style={{ fontWeight: "600" }} numberOfLines={1}>
                    {friendshipStatus?.status === 'friends' ? 'Friends'
                      : friendshipStatus?.status === 'request_received' ? 'Accept Friend Request'
                      : friendshipStatus?.status === 'request_sent' ? 'Request Sent'
                      : 'Add Friend'}
                  </ThemedText>
                  <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: 2 }} numberOfLines={2}>
                    {friendshipStatus?.status === 'friends'
                      ? 'Tap to remove — used for location requests and friends-only stories'
                      : friendshipStatus?.status === 'request_received'
                      ? `${otherUserName} wants to be your friend`
                      : friendshipStatus?.status === 'request_sent'
                      ? `Waiting for ${otherUserName} to accept`
                      : 'Lets you request their location and see friends-only stories'}
                  </ThemedText>
                </View>
                <Feather name="chevron-right" size={18} color={theme.textSecondary} />
              </AnimatedPressable>

              <AnimatedPressable
                style={[styles.settingsOption, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}
                onPress={handleBlockUser}
                disabled={blockUserMutation.isPending || unblockUserMutation.isPending}
              >
                <View style={[styles.settingsOptionIcon, { backgroundColor: isBlockedByMe ? '#4ECDC4' : '#FF3B30' }]}>
                  {blockUserMutation.isPending || unblockUserMutation.isPending ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Feather name={isBlockedByMe ? "user-check" : "slash"} size={20} color="#fff" />
                  )}
                </View>
                <View style={styles.settingsOptionText}>
                  <ThemedText type="body" style={{ fontWeight: "600", color: isBlockedByMe ? theme.text : '#FF3B30' }} numberOfLines={1}>
                    {isBlockedByMe ? "Unblock User" : "Block User"}
                  </ThemedText>
                  <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: 2 }} numberOfLines={2}>
                    {isBlockedByMe
                      ? "Allow this user to message and call you again"
                      : "Stop receiving messages and calls from this user"}
                  </ThemedText>
                </View>
                <Feather name="chevron-right" size={18} color={theme.textSecondary} />
              </AnimatedPressable>

              <AnimatedPressable
                style={[styles.settingsOption, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}
                onPress={handleReportUser}
              >
                <View style={[styles.settingsOptionIcon, { backgroundColor: '#FF9500' }]}>
                  <Feather name="flag" size={20} color="#fff" />
                </View>
                <View style={styles.settingsOptionText}>
                  <ThemedText type="body" style={{ fontWeight: "600" }} numberOfLines={1}>
                    Report User
                  </ThemedText>
                  <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: 2 }} numberOfLines={2}>
                    Send to our moderation team. We have zero tolerance for abusive users.
                  </ThemedText>
                </View>
                <Feather name="chevron-right" size={18} color={theme.textSecondary} />
              </AnimatedPressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Report-reason picker — proper bottom sheet (Alert can't show 9 buttons reliably). */}
      <Modal
        visible={!!reportTarget}
        transparent
        animationType="slide"
        onRequestClose={closeReportSheet}
      >
        <Pressable
          style={styles.chatSettingsBackdrop}
          onPress={closeReportSheet}
        >
          <BlurView
            intensity={Platform.OS === "ios" ? 40 : 80}
            tint={isDark ? "dark" : "light"}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.chatSettingsBackdropTint} pointerEvents="none" />

          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={[
              styles.chatSettingsMenu,
              {
                backgroundColor: theme.backgroundSecondary,
                paddingBottom: insets.bottom + Spacing.lg,
                borderColor: theme.border,
              },
            ]}
          >
            <View style={styles.chatSettingsHandleWrap}>
              <View style={[styles.chatSettingsHandle, { backgroundColor: theme.border }]} />
            </View>

            <View style={styles.chatSettingsHeader}>
              <View style={{ flex: 1 }}>
                <ThemedText type="h3" style={{ fontWeight: "700" }}>
                  {reportTarget?.reportedMessageId ? "Report Message" : "Report User"}
                </ThemedText>
                <ThemedText
                  type="small"
                  style={{ color: theme.textSecondary, marginTop: 4 }}
                  numberOfLines={2}
                >
                  Why are you reporting this? Reviewed by our team within 24 hours.
                </ThemedText>
              </View>
              <AnimatedPressable
                onPress={closeReportSheet}
                style={[styles.chatSettingsClose, { backgroundColor: theme.backgroundDefault }]}
                hitSlop={8}
                disabled={submittingReport}
              >
                <Feather name="x" size={18} color={theme.textSecondary} />
              </AnimatedPressable>
            </View>

            <ScrollView
              style={{ maxHeight: 480 }}
              contentContainerStyle={{ paddingTop: Spacing.xs, paddingBottom: Spacing.md, gap: Spacing.xs }}
              showsVerticalScrollIndicator={false}
            >
              {REPORT_REASONS.map((r) => (
                <AnimatedPressable
                  key={r.key}
                  onPress={() => handleReportReasonPick(r.key)}
                  disabled={submittingReport}
                  style={[
                    styles.reportReasonRow,
                    { backgroundColor: theme.backgroundDefault, borderColor: theme.border },
                  ]}
                >
                  <View style={styles.reportReasonIcon}>
                    <Feather
                      name={
                        r.key === "csam"
                          ? "alert-octagon"
                          : r.key === "threats_or_violence"
                          ? "alert-triangle"
                          : r.key === "harassment" || r.key === "hate_speech"
                          ? "user-x"
                          : r.key === "sexual_content"
                          ? "eye-off"
                          : r.key === "scam_or_fraud"
                          ? "dollar-sign"
                          : r.key === "impersonation"
                          ? "user"
                          : r.key === "spam"
                          ? "slash"
                          : "flag"
                      }
                      size={18}
                      color={r.key === "csam" ? "#FF3B30" : theme.text}
                    />
                  </View>
                  <ThemedText
                    type="body"
                    style={{
                      flex: 1,
                      fontWeight: "500",
                      color: r.key === "csam" ? "#FF3B30" : theme.text,
                    }}
                    numberOfLines={2}
                  >
                    {r.label}
                  </ThemedText>
                  {submittingReport ? (
                    <ActivityIndicator size="small" color={theme.textSecondary} />
                  ) : (
                    <Feather name="chevron-right" size={18} color={theme.textSecondary} />
                  )}
                </AnimatedPressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <CallActionsSheet
        visible={showCallOptions}
        onClose={() => setShowCallOptions(false)}
        onSecureAudioCall={() => {
          navigation.navigate("AudioCall", {
            callId: "",
            receiverId: otherUserId,
            receiverName: otherUserName,
          });
        }}
        onSecureVideoCall={() => {
          navigation.navigate("VideoCall", {
            callId: "",
            receiverId: otherUserId,
            receiverName: otherUserName,
          });
        }}
        phoneNumber={otherUserPhone}
        contactName={otherUserName}
      />

      <MessageInfoSheet
        visible={showMessageInfo}
        message={selectedMessage}
        theme={theme}
        styles={styles}
        onClose={() => { setShowMessageInfo(false); setSelectedMessage(null); }}
      />

      <DeleteConfirmSheet
        visible={showDeleteSheet}
        message={selectedMessage}
        currentUserId={user?.id}
        theme={theme}
        styles={styles}
        onClose={() => setShowDeleteSheet(false)}
        onDeleteForMe={handleDeleteMessage}
        onDeleteForEveryone={handleDeleteForEveryone}
      />

      <GifPicker
        visible={showGifPicker}
        onClose={() => setShowGifPicker(false)}
        onSelectGif={async (gifUrl) => {
          try {
            setIsSending(true);
            const token = await getStoredToken();
            // getApiUrl() always ends in "/" -- string-concatenating another
            // leading "/" produced a literal double slash that 404'd on the
            // server. new URL() resolves it correctly (see GifPicker.tsx for
            // the same fix and full explanation).
            const response = await fetch(new URL('/api/messages', getApiUrl()).toString(), {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                conversationId,
                receiverId: otherUserId,
                mediaUrl: gifUrl,
                mediaType: "gif",
              }),
            });
            if (response.ok) {
              const msg = await response.json();
              setMessages((prev) => [...prev, msg]);
              flatListRef.current?.scrollToEnd({ animated: true });
              playSendSound();
            } else {
              Alert.alert('Could Not Send', 'The GIF could not be sent. Please try again.');
            }
          } catch (error) {
            console.error("Error sending GIF:", error);
            Alert.alert('Could Not Send', 'The GIF could not be sent. Please check your connection and try again.');
          } finally {
            setIsSending(false);
          }
        }}
      />
    </KeyboardAvoidingView>

    {screenshotDetected ? (
      <View style={styles.screenshotBlackout}>
        <Feather name="shield" size={48} color="#fff" />
        <ThemedText style={styles.screenshotBlackoutText}>
          Screenshots are not allowed
        </ThemedText>
        <ThemedText style={styles.screenshotBlackoutSubtext}>
          This conversation is protected
        </ThemedText>
      </View>
    ) : null}

    <MessageHoldOverlay
      visible={!!holdMessage && !!holdLayout}
      onClose={closeHoldOverlay}
      message={holdMessage ? ({
        id: holdMessage.id,
        isOwn: holdMessage.senderId === user?.id,
        text:
          holdMessage.deletedForEveryone
            ? "This message was deleted"
            : (decryptedCache[holdMessage.id]
                ?? tryDecrypt(holdMessage.content, holdMessage.id)
                ?? holdMessage.content
                ?? null),
        mediaUrl: holdMessage.mediaUrl ?? null,
        mediaType: holdMessage.mediaType ?? null,
        timeText: formatTime(holdMessage.createdAt),
      } as HoldMessage) : null}
      layout={holdLayout}
      reactions={holdMessage ? (reactionsMap[holdMessage.id] ?? {}) : {}}
      currentUserId={user?.id ?? null}
      onReact={(emoji) => {
        if (!holdMessage) return;
        const id = holdMessage.id;
        closeHoldOverlay();
        handleReact(emoji, id);
      }}
      onOpenEmojiPicker={() => {
        // Reuse existing keyboard emoji picker as a fallback for "more emojis".
        closeHoldOverlay();
        setShowEmojiPicker(true);
      }}
      actions={(() => {
        if (!holdMessage) return [] as HoldAction[];
        const isMine = holdMessage.senderId === user?.id;
        const isText = !!(holdMessage.content && !holdMessage.deletedForEveryone);
        const list: HoldAction[] = [
          { key: 'reply', label: 'Reply', icon: 'corner-up-left',
            onPress: () => { closeHoldOverlay(); handleReplyToMessage(); } },
          { key: 'reply-camera', label: 'Reply with Camera', icon: 'camera',
            onPress: () => { closeHoldOverlay(); handleReplyWithCamera(); } },
          { key: 'forward', label: 'Forward', icon: 'corner-up-right',
            onPress: () => { closeHoldOverlay(); handleForwardMessage(); } },
        ];
        if (isText) list.push({ key: 'copy', label: 'Copy', icon: 'copy',
          onPress: () => { closeHoldOverlay(); handleCopyMessage(); } });
        list.push({ key: 'select', label: 'Select', icon: 'check-square',
          onPress: () => { closeHoldOverlay(); handleEnterSelectMode(holdMessage); } });
        list.push({ key: 'pin', label: pinnedMessageId === holdMessage.id ? 'Unpin' : 'Pin',
          icon: 'bookmark',
          onPress: () => { closeHoldOverlay(); handlePinMessage(); } });
        // Save is a device-local highlight+bookmark; it doesn't make sense
        // for messages that are about to disappear, so it's hidden entirely
        // when this conversation has a disappearing-messages timer active.
        if (conversationTimer === 0) {
          list.push({ key: 'save', label: savedMessageIds.has(holdMessage.id) ? 'Unsave' : 'Save',
            icon: savedMessageIds.has(holdMessage.id) ? 'star' : 'star',
            onPress: () => { closeHoldOverlay(); handleToggleSaveMessage(holdMessage.id); } });
        }
        list.push({ key: 'info', label: 'Message Info', icon: 'info',
          onPress: () => { closeHoldOverlay(); handleShowMessageInfo(); } });
        list.push({ key: 'share', label: 'Share', icon: 'share',
          onPress: () => { closeHoldOverlay(); handleShareMessage(); } });
        if (!isMine) list.push({ key: 'report', label: 'Report', icon: 'flag',
          onPress: () => { closeHoldOverlay(); handleReportMessage(); } });
        if (user?.isVip) list.push({ key: 'hide', label: 'Hide to Locker', icon: 'lock',
          onPress: () => { closeHoldOverlay(); handleHideToLocker(); } });
        list.push({ key: 'delete', label: 'Delete', icon: 'trash-2', destructive: true,
          onPress: () => { closeHoldOverlay(); setShowDeleteSheet(true); } });
        return list;
      })()}
    />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  headerAvatarText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  headerInfo: {
    alignItems: "flex-start",
  },
  headerName: {
    fontWeight: "600",
    fontSize: 16,
  },
  onlineIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  onlineText: {
    fontSize: 12,
  },
  headerButtons: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  // Wrapper gives the banner its own reserved block in the list's normal
  // flow (extra bottom margin) so a longer message — e.g. the "N messages
  // will send once they do" queued-count text, which can wrap to 2-3
  // lines — never sits close enough to the first message bubble below it
  // to visually collide with it.
  encryptionBannerWrapper: {
    marginBottom: Spacing.md,
  },
  encryptionBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginHorizontal: Spacing.md,
  },
  encryptionBannerIcon: {
    marginTop: 2,
  },
  encryptionBannerText: {
    flex: 1,
    flexShrink: 1,
    flexWrap: 'wrap',
    marginLeft: 6,
    lineHeight: 16,
  },
  messageList: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: 100,
    flexGrow: 1,
  },
  messageWrapper: {
    marginBottom: Spacing.md,
    maxWidth: "80%",
  },
  ownMessageWrapper: {
    alignSelf: "flex-end",
  },
  otherMessageWrapper: {
    alignSelf: "flex-start",
  },
  messageBubble: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: 20,
    maxWidth: "100%",
  },
  ownBubble: {
    borderBottomRightRadius: 4,
  },
  otherBubble: {
    borderBottomLeftRadius: 4,
  },
  reactionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
    gap: 4,
  },
  reactionsRowOwn: {
    justifyContent: 'flex-end',
  },
  reactionsRowOther: {
    justifyContent: 'flex-start',
  },
  reactionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    gap: 2,
  },
  reactionEmoji: {
    fontSize: 14,
  },
  reactionCount: {
    fontSize: 12,
    fontWeight: '600',
  },
  reactionPickerContainer: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
  },
  reactionPickerRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  reactionPickerEmoji: {
    padding: Spacing.md,
  },
  reactionPickerEmojiText: {
    fontSize: 32,
  },
  reactionPickerMore: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaContainer: {
    marginBottom: Spacing.sm,
    borderRadius: 12,
    overflow: "hidden",
  },
  mediaImage: {
    width: 200,
    height: 200,
    borderRadius: 12,
  },
  videoPlaceholder: {
    width: 200,
    height: 150,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  voiceMessageContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    minWidth: 180,
  },
  fileBubble: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    minWidth: 200,
    maxWidth: 260,
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  fileIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  playButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  waveformPlaceholder: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    flex: 1,
  },
  waveformBar: {
    width: 3,
    borderRadius: 1.5,
  },
  voiceDuration: {
    fontSize: 12,
    marginLeft: Spacing.sm,
  },
  transcriptionText: {
    fontSize: 13,
    marginTop: Spacing.xs,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  hiddenMessage: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  hiddenText: {
    fontSize: 14,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
    flexWrap: "wrap",
    flexShrink: 1,
  },
  messageFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: Spacing.xs,
  },
  ownFooter: {
    justifyContent: "flex-end",
  },
  otherFooter: {
    justifyContent: "flex-start",
  },
  retryButton: {
    padding: 2,
  },
  timeText: {
    fontSize: 11,
  },
  tickContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 2,
  },
  secondTick: {
    marginLeft: -8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: Spacing["5xl"],
    gap: Spacing.md,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: "center",
  },
  inputContainer: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.05)",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: Spacing.sm,
  },
  attachButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  inputWrapper: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    borderRadius: 22,
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    fontSize: 16,
    maxHeight: 120,
    lineHeight: 22,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
    paddingTop: Platform.OS === 'ios' ? 10 : 6,
    margin: 0,
  },
  inputActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginLeft: Spacing.xs,
  },
  inputActionButton: {
    width: 36,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  voiceButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  recordingContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    gap: Spacing.md,
  },
  cancelRecordingButton: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  recordingInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  recordingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#FF3B30",
  },
  recordingTime: {
    fontSize: 18,
    fontWeight: "600",
  },
  recordingLabel: {
    fontSize: 14,
  },
  sendRecordingButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  stopRecordingButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  deletePreviewButton: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  previewInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  playPreviewButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  previewWaveform: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    height: 24,
    gap: 2,
  },
  previewDuration: {
    fontSize: 14,
    fontWeight: "500",
    minWidth: 40,
    textAlign: "right",
  },
  typingIndicator: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  typingDots: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  typingText: {
    fontSize: 13,
    fontStyle: "italic",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  attachmentMenu: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  attachmentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  attachmentTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  attachmentGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
    justifyContent: "flex-start",
  },
  attachmentOption: {
    alignItems: "center",
    width: 68,
    gap: 6,
  },
  attachmentIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  attachmentLabel: {
    fontSize: 11,
    textAlign: "center",
  },
  contactPickerContainer: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: Spacing.md,
    paddingHorizontal: Spacing.md,
    maxHeight: '85%',
  },
  contactSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 12,
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  contactSearchInput: {
    flex: 1,
    fontSize: 15,
    padding: 0,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  contactAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contactAvatarText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  contactCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contactSendBtn: {
    marginTop: Spacing.sm,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  emojiPickerContainer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: Spacing.lg,
    paddingHorizontal: Spacing.md,
    maxHeight: '60%',
  },
  emojiCategoryTabs: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.sm,
  },
  emojiCategoryTab: {
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  emojiCategoryLabel: {
    fontSize: 22,
  },
  emojiGrid: {
    paddingBottom: Spacing.lg,
  },
  emojiItem: {
    flex: 1,
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xs,
  },
  emojiText: {
    fontSize: 28,
  },
  messageOptionsContainer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing["3xl"],
  },
  messageOptionsHandle: {
    alignItems: "center",
    paddingBottom: Spacing.lg,
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  messageOptionsTitle: {
    textAlign: "center",
    marginBottom: Spacing.lg,
  },
  messageOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
  },
  messageOptionIcon: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.xs,
    justifyContent: "center",
    alignItems: "center",
  },
  messageOptionText: {
    flex: 1,
  },
  backgroundImage: {
    flex: 1,
  },
  backgroundOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  chatSettingsBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
  },
  chatSettingsBackdropTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  chatSettingsMenu: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    maxHeight: "85%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 16,
  },
  chatSettingsHandleWrap: {
    alignItems: "center",
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.sm,
  },
  chatSettingsHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    opacity: 0.6,
  },
  chatSettingsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.md,
  },
  chatSettingsClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  settingsOptions: {
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  settingsOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    paddingLeft: Spacing.md,
    paddingRight: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 72,
    gap: Spacing.md,
  },
  settingsOptionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  colorSwatch: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  settingsOptionText: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  reportReasonRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.md,
    minHeight: 56,
  },
  reportReasonIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  vipBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  vipUpgradeCard: {
    alignItems: 'center',
    padding: Spacing.xl,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
  },
  vipUpgradeIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  upgradeButton: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.lg,
  },
  blockedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  unblockButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    marginLeft: Spacing.md,
  },
  selectModeWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectionCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: Spacing.sm,
  },
  selectionCheckboxInner: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectionToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  selectionToolbarButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  selectionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  screenshotBlackout: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  screenshotBlackoutText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginTop: Spacing.lg,
  },
  screenshotBlackoutSubtext: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    marginTop: Spacing.sm,
  },
});
