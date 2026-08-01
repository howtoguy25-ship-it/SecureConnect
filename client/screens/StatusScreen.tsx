import React, { useState, useCallback, useEffect, useRef } from "react";
import { View, StyleSheet, FlatList, Pressable, ActivityIndicator, Alert, Platform, Modal } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { Feather } from "@expo/vector-icons";
import { useVideoPlayer, VideoView } from "expo-video";
import * as VideoThumbnails from "expo-video-thumbnails";
import * as ScreenCapture from "expo-screen-capture";
import { Image } from "expo-image";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/contexts/AuthContext";
import { Spacing, BorderRadius } from "@/constants/theme";
import { getApiUrl, apiRequest } from "@/lib/query-client";
import { getStoredToken } from "@/lib/auth";
import naclUtil from "tweetnacl-util";
import { uploadEncryptedMedia, fetchAndDecryptEncryptedMedia } from "@/utils/crypto/encryptedMediaClient";
import {
  computeEligibleViewerIds,
  encryptStoryForViewers,
  unwrapStoryMediaKey,
  decryptStoryCaption,
} from "@/utils/crypto/statusCrypto";
import { AdBanner } from "@/components/AdBanner";
import { AnimatedPressable } from "@/components/AnimatedPressable";
import { StatusItemSkeleton } from "@/components/Skeleton";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";

type PrivacyOption = "everyone" | "friends" | "custom";

interface StatusViewer {
  id: string;
  viewedAt: string;
  watchDurationMs?: number;
  completed?: boolean;
  viewer: {
    id: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
}

interface StatusAnalytics {
  totalViews: number;
  completedViews: number;
  completionRate: number;
  avgWatchMs: number;
  totalWatchMs: number;
}

function formatMs(ms: number): string {
  if (!ms || ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s - m * 60);
  return `${m}m ${rem}s`;
}

function StatusViewersModal({ 
  visible, 
  onClose, 
  statusId, 
  theme 
}: { 
  visible: boolean; 
  onClose: () => void; 
  statusId: string;
  theme: any;
}) {
  const { data: viewers = [], isLoading } = useQuery<StatusViewer[]>({
    queryKey: [`/api/statuses/${statusId}/viewers`],
    enabled: visible && !!statusId,
  });
  const { data: analytics } = useQuery<StatusAnalytics>({
    queryKey: [`/api/statuses/${statusId}/analytics`],
    enabled: visible && !!statusId,
  });

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={[viewerStyles.container, { backgroundColor: theme.backgroundRoot }]}>
        <View style={[viewerStyles.header, { borderBottomColor: theme.border }]}>
          <ThemedText type="h3">Viewers</ThemedText>
          <Pressable onPress={onClose}>
            <Feather name="x" size={24} color={theme.text} />
          </Pressable>
        </View>

        {isLoading ? (
          <View style={viewerStyles.loading}>
            <ActivityIndicator size="large" color={theme.primary} />
          </View>
        ) : viewers.length === 0 ? (
          <View style={viewerStyles.empty}>
            <Feather name="eye-off" size={48} color={theme.textSecondary} />
            <ThemedText type="body" style={{ color: theme.textSecondary, marginTop: Spacing.md }}>
              No one has viewed this status yet
            </ThemedText>
          </View>
        ) : (
          <FlatList
            data={viewers}
            keyExtractor={(item) => item.id}
            ListHeaderComponent={analytics && analytics.totalViews > 0 ? (
              <View style={[viewerStyles.analyticsCard, { backgroundColor: theme.backgroundDefault }]}>
                <View style={viewerStyles.analyticsRow}>
                  <View style={viewerStyles.analyticsCell}>
                    <ThemedText type="h3" style={{ color: theme.primary }}>{analytics.totalViews}</ThemedText>
                    <ThemedText type="small" style={{ color: theme.textSecondary }}>Views</ThemedText>
                  </View>
                  <View style={viewerStyles.analyticsCell}>
                    <ThemedText type="h3" style={{ color: theme.primary }}>{analytics.completionRate}%</ThemedText>
                    <ThemedText type="small" style={{ color: theme.textSecondary }}>Completed</ThemedText>
                  </View>
                  <View style={viewerStyles.analyticsCell}>
                    <ThemedText type="h3" style={{ color: theme.primary }}>{formatMs(analytics.avgWatchMs)}</ThemedText>
                    <ThemedText type="small" style={{ color: theme.textSecondary }}>Avg watch</ThemedText>
                  </View>
                </View>
              </View>
            ) : null}
            renderItem={({ item }) => (
              <View style={[viewerStyles.viewerItem, { backgroundColor: theme.backgroundDefault }]}>
                <View style={[viewerStyles.avatar, { backgroundColor: theme.primary }]}>
                  {item.viewer.avatarUrl ? (
                    <Image source={{ uri: item.viewer.avatarUrl }} style={viewerStyles.avatarImage} />
                  ) : (
                    <ThemedText type="body" style={{ color: "#fff" }}>
                      {item.viewer.displayName?.charAt(0) || "?"}
                    </ThemedText>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText type="body">{item.viewer.displayName || "Unknown"}</ThemedText>
                  <ThemedText type="small" style={{ color: theme.textSecondary }}>
                    {formatTime(item.viewedAt)}
                    {item.watchDurationMs ? ` · watched ${formatMs(item.watchDurationMs)}` : ''}
                    {item.completed ? ' · finished' : ''}
                  </ThemedText>
                </View>
                {item.completed ? (
                  <Feather name="check-circle" size={18} color={theme.primary} />
                ) : null}
              </View>
            )}
            contentContainerStyle={{ padding: Spacing.lg }}
          />
        )}
      </View>
    </Modal>
  );
}

const viewerStyles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: Spacing.lg,
    borderBottomWidth: 1,
  },
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  empty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  viewerItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  analyticsCard: {
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  analyticsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  analyticsCell: {
    alignItems: "center",
    flex: 1,
  },
});

function StatusVideoPreview({ 
  uri, 
  style, 
  onEditPress,
  theme 
}: { 
  uri: string; 
  style: any;
  onEditPress?: () => void;
  theme: any;
}) {
  const [isPlaying, setIsPlaying] = useState(true);
  const player = useVideoPlayer({ uri }, (p) => {
    p.loop = true;
    p.muted = false;
    p.play();
  });

  const togglePlayPause = () => {
    if (isPlaying) {
      player.pause();
    } else {
      player.play();
    }
    setIsPlaying(!isPlaying);
  };

  return (
    <View style={[style, { position: 'relative' }]}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
      />
      <View style={videoPreviewStyles.overlay}>
        <Pressable 
          style={[videoPreviewStyles.playPauseButton, { backgroundColor: 'rgba(0,0,0,0.5)' }]}
          onPress={togglePlayPause}
        >
          <Feather name={isPlaying ? "pause" : "play"} size={32} color="#fff" />
        </Pressable>
        {onEditPress ? (
          <Pressable 
            style={[videoPreviewStyles.editButton, { backgroundColor: theme.primary }]}
            onPress={onEditPress}
          >
            <Feather name="crop" size={18} color="#fff" />
            <ThemedText type="small" style={{ color: '#fff', marginLeft: 4 }}>Edit</ThemedText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const videoPreviewStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playPauseButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editButton: {
    position: 'absolute',
    bottom: Spacing.md,
    right: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
});

// Renders a real preview frame for a video status tile. Video URLs can't be
// displayed by <Image> (which is why video tiles used to render black), so we
// extract a frame with expo-video-thumbnails on native. On web (no thumbnail
// API) we fall back to a dark tile — the play badge overlay still shows.
const videoThumbCache = new Map<string, string>();

function VideoThumb({ uri, style }: { uri: string; style: any }) {
  const [thumb, setThumb] = useState<string | null>(videoThumbCache.get(uri) ?? null);

  useEffect(() => {
    if (!uri || Platform.OS === "web" || videoThumbCache.has(uri)) return;
    let alive = true;
    VideoThumbnails.getThumbnailAsync(uri, { time: 500 })
      .then((result) => {
        videoThumbCache.set(uri, result.uri);
        if (alive) setThumb(result.uri);
      })
      .catch(() => {
        // Leave the dark fallback tile — the play badge still communicates
        // that this is a video.
      });
    return () => {
      alive = false;
    };
  }, [uri]);

  if (!thumb) {
    return <View style={[style, { backgroundColor: "#1a1a1a" }]} />;
  }
  return <Image source={{ uri: thumb }} style={style} contentFit="cover" cachePolicy="memory-disk" />;
}

function StatusVideoPlayer({ uri, style, onComplete }: { uri: string; style: any; onComplete?: () => void }) {
  const player = useVideoPlayer({ uri }, (p) => {
    p.loop = true;
    p.play();
  });

  useEffect(() => {
    if (!onComplete) return;
    // loop=true means this fires on every replay — the ref it sets is a
    // one-way latch, so re-firing on later loops is harmless.
    const sub = player.addListener('playToEnd', onComplete);
    return () => sub.remove();
  }, [player, onComplete]);

  return (
    <VideoView
      player={player}
      style={style}
      contentFit="contain"
      nativeControls={true}
    />
  );
}

interface Status {
  id: string;
  userId: string;
  mediaUrl: string | null;
  mediaType: string | null;
  caption: string | null;
  privacy: string;
  expiresAt: string;
  createdAt: string;
  user?: {
    id: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  viewCount?: number;
  // E2EE (Stories phase 1) — present only on closed-audience stories.
  isEncrypted?: boolean;
  encryptedCaption?: string | null;
  captionNonce?: string | null;
  /** This viewer's own slice of the story's key wraps — see server/storage.ts getStatuses. */
  mediaKeyWrap?: { wrappedKey: string; nonce: string } | null;
}

// Helper to resolve media URLs - handles both relative paths and full URLs
const resolveMediaUrl = (mediaUrl: string | null): string | null => {
  if (!mediaUrl) return null;
  
  // If already a full URL, return as-is
  if (mediaUrl.startsWith('http://') || mediaUrl.startsWith('https://')) {
    return mediaUrl;
  }
  
  // Relative path - construct full URL using current environment
  try {
    const baseUrl = getApiUrl();
    return new URL(mediaUrl, baseUrl).toString();
  } catch {
    return mediaUrl;
  }
};

interface Friend {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export default function StatusScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showStatusViewer, setShowStatusViewer] = useState(false);
  const [showViewersList, setShowViewersList] = useState(false);
  const [viewingStatus, setViewingStatus] = useState<Status | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedMediaType, setSelectedMediaType] = useState<"image" | "video">("image");
  const [selectedMimeType, setSelectedMimeType] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [privacy, setPrivacy] = useState<PrivacyOption>("everyone");
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [allowEditing, setAllowEditing] = useState(false);

  // Block screenshots + screen recording while a story is open fullscreen —
  // same protection chats, Locker, and Safe Code already get, applied
  // unconditionally to every user (not gated behind VIP). On iOS this
  // prevents the system screenshot bitmap; on Android it sets FLAG_SECURE,
  // which also hides the window from the app-switcher preview.
  useEffect(() => {
    if (Platform.OS === "web") return;
    if (!showStatusViewer) {
      ScreenCapture.allowScreenCaptureAsync("status-viewer").catch(() => {});
      return;
    }
    ScreenCapture.preventScreenCaptureAsync("status-viewer").catch(() => {});
    return () => {
      ScreenCapture.allowScreenCaptureAsync("status-viewer").catch(() => {});
    };
  }, [showStatusViewer]);

  const { data: statuses = [], isLoading } = useQuery<Status[]>({
    queryKey: ["/api/statuses"],
  });

  const { data: myStatuses = [] } = useQuery<Status[]>({
    queryKey: ["/api/statuses/mine"],
  });

  const { data: friends = [] } = useQuery<Friend[]>({
    queryKey: ["/api/friends"],
  });

  // E2EE (Stories phase 1) — decrypt cache for encrypted stories. Keyed by
  // statusId so the same story isn't re-decrypted on every render; a ref
  // tracks in-flight decrypts so a fast re-render (e.g. the 15s feed
  // refetch) doesn't kick off a duplicate attempt for the same story.
  const [decryptedMedia, setDecryptedMedia] = useState<Record<string, string>>({});
  const [decryptedCaptions, setDecryptedCaptions] = useState<Record<string, string | null>>({});
  const [undecryptable, setUndecryptable] = useState<Record<string, boolean>>({});
  // Plain (non-encrypted) media <Image> had no onError handling — a failed
  // network load (expired URL, dropped connection, etc.) rendered nothing
  // at all: no icon, no message, just a blank tile indistinguishable from
  // "still loading" or "frozen". Track failures explicitly so we can show
  // real feedback instead of silence.
  const [mediaLoadFailed, setMediaLoadFailed] = useState<Record<string, boolean>>({});
  const decryptingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const allStatuses = [...statuses, ...myStatuses];
    const pending = allStatuses.filter(
      (s) => s.isEncrypted && !decryptedMedia[s.id] && !undecryptable[s.id] && !decryptingRef.current.has(s.id),
    );
    if (pending.length === 0) return;

    pending.forEach((status) => {
      decryptingRef.current.add(status.id);
      (async () => {
        try {
          if (!status.mediaKeyWrap) throw new Error("no key for this viewer");
          const mediaKey = await unwrapStoryMediaKey(status.userId, status.mediaKeyWrap);
          if (!mediaKey) throw new Error("could not unwrap media key");

          let caption: string | null = null;
          if (status.encryptedCaption && status.captionNonce) {
            caption = decryptStoryCaption(status.encryptedCaption, status.captionNonce, mediaKey);
          }

          const token = await getStoredToken();
          const baseUrl = getApiUrl();
          const uri = await fetchAndDecryptEncryptedMedia({
            envelope: {
              v: 1,
              mk: naclUtil.encodeBase64(mediaKey),
              path: status.mediaUrl || "",
              mt: (status.mediaType === "video" ? "video" : "image"),
              size: 0,
            },
            token: token ?? "",
            apiBaseUrl: baseUrl,
            cacheKey: status.id,
          });

          setDecryptedMedia((prev) => ({ ...prev, [status.id]: uri }));
          setDecryptedCaptions((prev) => ({ ...prev, [status.id]: caption }));
        } catch (e) {
          console.error("Failed to decrypt story", status.id, e);
          setUndecryptable((prev) => ({ ...prev, [status.id]: true }));
        }
      })();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statuses, myStatuses]);

  /** Resolves the renderable media URI for a status, encrypted or not. */
  const getDisplayMediaUri = (status: Status): string | null => {
    if (!status.isEncrypted) return resolveMediaUrl(status.mediaUrl);
    return decryptedMedia[status.id] ?? null;
  };

  /** Resolves the caption text for a status, encrypted or not. */
  const getDisplayCaption = (status: Status): string | null => {
    if (!status.isEncrypted) return status.caption;
    return decryptedCaptions[status.id] ?? null;
  };

  const createStatusMutation = useMutation({
    mutationFn: async (data: {
      mediaUrl: string; mediaType: string; privacy: string; customViewers?: string[];
      caption?: string;
      isEncrypted?: boolean;
      encryptedCaption?: string | null;
      captionNonce?: string | null;
      mediaKeyWraps?: Record<string, { wrappedKey: string; nonce: string }>;
    }) => {
      return apiRequest("POST", "/api/statuses", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/statuses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/statuses/mine"] });
      setShowCreateModal(false);
      resetCreateForm();
    },
  });

  const resetCreateForm = () => {
    setSelectedImage(null);
    setSelectedMediaType("image");
    setSelectedMimeType(null);
    setCaption("");
    setPrivacy("everyone");
    setSelectedFriends([]);
  };

  const pickImage = async (shouldEdit: boolean = true) => {
    // Editing is on by default: images get the native 9:16 portrait crop UI
    // (standard story format), videos get the native trim UI on iOS.
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: shouldEdit,
      aspect: shouldEdit ? [9, 16] : undefined,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setSelectedImage(asset.uri);
      setSelectedMediaType(asset.type === "video" ? "video" : "image");
      setSelectedMimeType(asset.mimeType || null);
      setShowCreateModal(true);
    }
  };

  const openOwnStatus = (status: Status) => {
    setViewingStatus(status);
    setShowStatusViewer(true);
  };

  // ---- Story view-tracking (v1.0.6 analytics) -----------------------------
  // When the viewer opens someone else's story we mark Date.now() and start
  // a 5-second "image story" completion timer. Videos call onComplete via
  // the player's onPlaybackStatusUpdate. On close (or status switch) we POST
  // the accumulated duration + completion flag to /view.
  const viewOpenAtRef = useRef<number | null>(null);
  const viewCompletedRef = useRef<boolean>(false);
  const viewStatusIdRef = useRef<string | null>(null);
  const imageCompleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushStatusView = useCallback(async () => {
    const statusId = viewStatusIdRef.current;
    const openAt = viewOpenAtRef.current;
    if (!statusId || !openAt) return;
    const watchDurationMs = Math.max(0, Date.now() - openAt);
    const completed = viewCompletedRef.current;
    viewStatusIdRef.current = null;
    viewOpenAtRef.current = null;
    viewCompletedRef.current = false;
    if (imageCompleteTimerRef.current) {
      clearTimeout(imageCompleteTimerRef.current);
      imageCompleteTimerRef.current = null;
    }
    try {
      await apiRequest("POST", `/api/statuses/${statusId}/view`, { watchDurationMs, completed });
      // Keep aggregate view counts fresh so the owner sees their analytics
      // update next time they open the viewers sheet.
      queryClient.invalidateQueries({ queryKey: ["/api/statuses/mine"] });
    } catch {
      // Non-critical — a missed analytics event must never break the UX.
    }
  }, [queryClient]);

  const openOtherStatus = (status: Status) => {
    // Owner's own status doesn't count as a view.
    if (status.userId === user?.id) {
      openOwnStatus(status);
      return;
    }
    viewStatusIdRef.current = status.id;
    viewOpenAtRef.current = Date.now();
    viewCompletedRef.current = false;
    setViewingStatus(status);
    setShowStatusViewer(true);
    // Image stories: count as "completed" after 5s on screen — matches the
    // standard auto-advance window used by Instagram/WhatsApp stories.
    if (status.mediaType !== "video") {
      imageCompleteTimerRef.current = setTimeout(() => {
        viewCompletedRef.current = true;
      }, 5000);
    }
  };

  const closeStatusViewer = useCallback(() => {
    void flushStatusView();
    setShowStatusViewer(false);
    setViewingStatus(null);
  }, [flushStatusView]);

  const deleteStatusMutation = useMutation({
    mutationFn: async (statusId: string) => {
      return apiRequest("DELETE", `/api/statuses/${statusId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/statuses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/statuses/mine"] });
      setShowStatusViewer(false);
      setViewingStatus(null);
    },
    onError: () => {
      if (Platform.OS === "web") {
        window.alert("Failed to delete status. Please try again.");
      } else {
        Alert.alert("Error", "Failed to delete status. Please try again.");
      }
    },
  });

  const uploadAndCreateStatus = async () => {
    if (!selectedImage) return;

    setIsUploading(true);
    try {
      const token = await getStoredToken();
      const baseUrl = getApiUrl();

      // E2EE (Stories phase 1): if this story's audience is a closed set —
      // either the account-level Settings mode (contacts/except/only) or
      // this specific post's friends/custom override — encrypt the media
      // and caption client-side and skip the plaintext upload path below
      // entirely. 'everyone' with no post-level narrowing has no fixed
      // recipient set to encrypt to, so it stays on the existing plaintext
      // path unchanged.
      const eligibleViewerIds = await computeEligibleViewerIds({
        storyPrivacyMode: user?.storyPrivacyMode || "everyone",
        storyPrivacyExceptIds: user?.storyPrivacyExceptIds || [],
        storyPrivacyOnlyIds: user?.storyPrivacyOnlyIds || [],
        postPrivacy: privacy,
        postCustomViewers: privacy === "custom" ? selectedFriends : undefined,
      });

      if (eligibleViewerIds !== null && user?.id) {
        const encrypted = await encryptStoryForViewers(caption || null, eligibleViewerIds, user.id);
        if (!encrypted) {
          throw new Error("Couldn't set up encryption for this story. Please try again.");
        }
        const { envelope } = await uploadEncryptedMedia({
          uri: selectedImage,
          mediaType: selectedMediaType === "video" ? "video" : "image",
          token: token ?? "",
          apiBaseUrl: baseUrl,
          mediaKey: encrypted.mediaKey,
        });
        await createStatusMutation.mutateAsync({
          mediaUrl: envelope.path,
          mediaType: selectedMediaType,
          privacy,
          customViewers: privacy === "custom" ? selectedFriends : undefined,
          isEncrypted: true,
          encryptedCaption: encrypted.encryptedCaption,
          captionNonce: encrypted.captionNonce,
          mediaKeyWraps: encrypted.mediaKeyWraps,
        });
        return;
      }

      // Step 1: Get upload URL from object storage
      const uploadUrlResponse = await fetch(new URL("/api/objects/upload", baseUrl), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!uploadUrlResponse.ok) {
        throw new Error("Failed to get upload URL");
      }

      const { uploadURL } = await uploadUrlResponse.json();

      // Step 2: Determine correct MIME type - prefer picker's mimeType, fallback to extension-based detection
      let mimeType: string;
      
      if (selectedMimeType) {
        // Use mimeType directly from ImagePicker (most reliable for iOS HEIC/HEIF)
        mimeType = selectedMimeType;
      } else {
        // Fallback: derive from filename extension
        const filename = selectedImage.split("/").pop() || (selectedMediaType === "video" ? "status.mp4" : "status.jpg");
        const match = /\.(\w+)$/.exec(filename);
        const extension = match ? match[1].toLowerCase() : (selectedMediaType === "video" ? "mp4" : "jpg");
        
        // Map extensions to correct MIME types
        const getMimeType = (ext: string, isVideo: boolean): string => {
          if (isVideo) {
            const videoMimeMap: Record<string, string> = {
              mov: "video/quicktime",
              mp4: "video/mp4",
              m4v: "video/mp4",
              avi: "video/x-msvideo",
              webm: "video/webm",
            };
            return videoMimeMap[ext] || `video/${ext}`;
          } else {
            const imageMimeMap: Record<string, string> = {
              jpg: "image/jpeg",
              jpeg: "image/jpeg",
              png: "image/png",
              gif: "image/gif",
              webp: "image/webp",
              heic: "image/heic",
              heif: "image/heif",
            };
            return imageMimeMap[ext] || `image/${ext}`;
          }
        };
        mimeType = getMimeType(extension, selectedMediaType === "video");
      }

      if (Platform.OS === "web") {
        // Web: Use fetch to get blob
        const imageResponse = await fetch(selectedImage);
        const blob = await imageResponse.blob();
        const putRes = await fetch(uploadURL, {
          method: "PUT",
          body: blob,
          headers: {
            "Content-Type": mimeType,
          },
        });
        // Previously the response here was never checked — a rejected PUT
        // (expired signed URL, bad content-type, etc) would silently fall
        // through to the ACL step and create a status pointing at media that
        // was never actually written.
        if (!putRes.ok) {
          throw new Error(`Upload failed with status ${putRes.status}`);
        }
      } else {
        // Native: Verify file exists before uploading
        const fileInfo = await FileSystem.getInfoAsync(selectedImage);
        if (!fileInfo.exists) {
          throw new Error("Media file not found");
        }

        // Native: read the file into memory and PUT it via fetch — the same
        // approach the encrypted-media path (uploadEncryptedMedia) already
        // uses successfully for images/videos up to 50MB. expo-file-system's
        // native uploadAsync() was returning 400 from GCS's signed-URL PUT
        // (it drives its own native HTTP stack rather than fetch, and
        // doesn't set the request the same way GCS's V4 signing expects),
        // while fetch's RN implementation reliably sets Content-Length and
        // matches the working path exactly.
        const b64 = await FileSystem.readAsStringAsync(selectedImage, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const bytes = naclUtil.decodeBase64(b64);
        const putRes = await fetch(uploadURL, {
          method: "PUT",
          headers: {
            "Content-Type": mimeType,
          },
          body: bytes as BodyInit,
        });

        if (!putRes.ok) {
          throw new Error(`Upload failed with status ${putRes.status}`);
        }
      }

      // Step 3: Set ACL permissions for the uploaded media
      const aclResponse = await fetch(new URL("/api/objects/media", baseUrl), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ mediaURL: uploadURL.split("?")[0] }),
      });

      if (!aclResponse.ok) {
        throw new Error("Failed to set media permissions");
      }

      const { objectPath } = await aclResponse.json();
      // Store relative path in database - will be resolved to full URL when displaying
      // This ensures URLs work across different environments (dev, prod)
      await createStatusMutation.mutateAsync({
        mediaUrl: objectPath,
        mediaType: selectedMediaType,
        caption,
        privacy,
        customViewers: privacy === "custom" ? selectedFriends : undefined,
      });
    } catch (error: any) {
      console.error("Status upload error:", error);
      const errorMessage = error?.message || "Unknown error occurred";
      if (Platform.OS === "web") {
        window.alert(`Failed to upload status: ${errorMessage}`);
      } else {
        Alert.alert("Upload Failed", `Failed to upload status: ${errorMessage}`);
      }
    } finally {
      setIsUploading(false);
    }
  };

  const toggleFriendSelection = (friendId: string) => {
    setSelectedFriends(prev =>
      prev.includes(friendId)
        ? prev.filter(id => id !== friendId)
        : [...prev, friendId]
    );
  };

  const getPrivacyLabel = (p: PrivacyOption) => {
    switch (p) {
      case "everyone": return "Everyone";
      case "friends": return "Friends Only";
      case "custom": return "Custom";
    }
  };

  const getPrivacyIcon = (p: PrivacyOption) => {
    switch (p) {
      case "everyone": return "globe";
      case "friends": return "users";
      case "custom": return "user-check";
    }
  };

  const muteStatusUser = useCallback(async (targetUserId: string, targetName: string) => {
    try {
      await apiRequest("POST", `/api/statuses/mute/${targetUserId}`);
      queryClient.invalidateQueries({ queryKey: ["/api/statuses"] });
      if (Platform.OS !== "web") {
        Alert.alert("Muted", `You will no longer see status updates from ${targetName}.`);
      }
    } catch {
      if (Platform.OS !== "web") {
        Alert.alert("Error", "Could not mute this user. Please try again.");
      }
    }
  }, [queryClient]);

  const promptMute = useCallback((item: Status) => {
    if (!item.user || item.userId === user?.id) return;
    const name = item.user.displayName || "this user";
    const doMute = () => muteStatusUser(item.userId, name);
    if (Platform.OS === "web") {
      if (window.confirm(`Mute ${name}'s status updates?`)) doMute();
    } else {
      Alert.alert(
        `Mute ${name}?`,
        "You won't see their status updates in your feed anymore. You can unmute from settings later.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Mute", style: "destructive", onPress: doMute },
        ],
      );
    }
  }, [muteStatusUser, user?.id]);

  const replyToStatus = useCallback(async (status: Status) => {
    try {
      const res = await apiRequest("POST", `/api/statuses/${status.id}/reply-context`);
      const ctx = await res.json() as {
        conversationId: string;
        otherUserId: string;
        otherUserName: string;
      };
      // Build the quote from what THIS client already has decrypted/resolved
      // locally rather than the server's raw row — for an encrypted (closed
      // -audience) status the server can only hand back ciphertext it can
      // never read, but this viewer just had it open on screen a moment ago.
      // mediaUrl is only carried through for a non-encrypted ("everyone")
      // status, where it's a real network URL the recipient can also load;
      // an encrypted status's local media URI is a cache file path that's
      // meaningless off this device, so the quote degrades to caption/name
      // only in that case rather than embedding something unusable.
      const statusReplyQuote = {
        statusId: status.id,
        posterName: status.user?.displayName || "their",
        caption: getDisplayCaption(status),
        mediaType: status.mediaType,
        mediaUrl: status.isEncrypted ? null : resolveMediaUrl(status.mediaUrl),
      };
      // Flush analytics for the in-progress view before navigating away.
      void flushStatusView();
      setShowStatusViewer(false);
      setViewingStatus(null);
      navigation.navigate("Conversation", {
        conversationId: ctx.conversationId,
        otherUserId: ctx.otherUserId,
        otherUserName: ctx.otherUserName,
        statusReplyQuote,
      });
    } catch {
      const msg = "Reply unavailable for this status.";
      if (Platform.OS === "web") window.alert(msg);
      else Alert.alert("Reply", msg);
    }
  }, [flushStatusView, navigation]);

  const renderStatus = useCallback(({ item }: { item: Status }) => (
    <Pressable
      style={[styles.statusCard, { backgroundColor: theme.backgroundDefault }]}
      onPress={() => openOtherStatus(item)}
      onLongPress={() => promptMute(item)}
      delayLongPress={350}
    >
      {item.isEncrypted && !getDisplayMediaUri(item) && !undecryptable[item.id] ? (
        <View style={[styles.statusPlaceholder, { backgroundColor: theme.backgroundSecondary }]}>
          <ActivityIndicator color={theme.textSecondary} />
        </View>
      ) : item.isEncrypted && undecryptable[item.id] ? (
        <View style={[styles.statusPlaceholder, { backgroundColor: theme.backgroundSecondary }]}>
          <Feather name="lock" size={32} color={theme.textSecondary} />
        </View>
      ) : getDisplayMediaUri(item) && mediaLoadFailed[item.id] ? (
        <View style={[styles.statusPlaceholder, { backgroundColor: theme.backgroundSecondary }]}>
          <Feather name="alert-triangle" size={32} color={theme.textSecondary} />
        </View>
      ) : getDisplayMediaUri(item) ? (
        item.mediaType === 'video' ? (
          <View style={styles.statusImage}>
            <VideoThumb uri={getDisplayMediaUri(item) ?? ''} style={styles.statusImage} />
            <View style={styles.feedVideoBadge}>
              <Feather name="play" size={22} color="#fff" />
            </View>
          </View>
        ) : (
          <Image
            source={{ uri: getDisplayMediaUri(item) ?? '' }}
            style={styles.statusImage}
            contentFit="cover"
            cachePolicy="memory-disk"
            onError={() => setMediaLoadFailed((prev) => ({ ...prev, [item.id]: true }))}
          />
        )
      ) : (
        <View style={[styles.statusPlaceholder, { backgroundColor: theme.backgroundSecondary }]}>
          <Feather name="image" size={40} color={theme.textSecondary} />
        </View>
      )}
      <View style={styles.statusOverlay}>
        <View style={styles.statusHeader}>
          <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
            {item.user?.avatarUrl ? (
              <Image source={{ uri: item.user.avatarUrl }} style={styles.avatarImage} />
            ) : (
              <ThemedText type="body" style={styles.avatarText}>
                {item.user?.displayName?.charAt(0) || "?"}
              </ThemedText>
            )}
          </View>
          <ThemedText type="body" style={styles.statusName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
            {item.user?.displayName || "Unknown"}
          </ThemedText>
        </View>
        {getDisplayCaption(item) ? (
          <ThemedText type="small" style={styles.caption} numberOfLines={2}>
            {getDisplayCaption(item)}
          </ThemedText>
        ) : null}
      </View>
    </Pressable>
  ), [theme, promptMute, decryptedMedia, decryptedCaptions, undecryptable]);

  const renderMyStatus = () => (
    <View style={styles.myStatusSection}>
      <Pressable
        style={[styles.addStatusButton, { backgroundColor: theme.backgroundDefault }]}
        onPress={() => pickImage(true)}
      >
        <View style={[styles.addIconContainer, { backgroundColor: theme.primary }]}>
          <Feather name="plus" size={24} color="#fff" />
        </View>
        <View style={styles.addStatusText}>
          <ThemedText type="body">Add Status</ThemedText>
          <ThemedText type="small" style={{ color: theme.textSecondary }}>
            Share photos and videos that disappear in 24 hours
          </ThemedText>
        </View>
      </Pressable>

      {myStatuses.length > 0 ? (
        <View style={styles.myStatusList}>
          <View style={styles.myStatusHeader}>
            <ThemedText type="small" style={[styles.sectionTitle, { color: theme.textSecondary, marginBottom: 0 }]}>
              Your Status
            </ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              {myStatuses.length} post{myStatuses.length !== 1 ? 's' : ''}
            </ThemedText>
          </View>
          <FlatList
            horizontal
            data={myStatuses}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <Pressable 
                style={[styles.myStatusThumb, { backgroundColor: theme.backgroundDefault, borderColor: theme.primary }]} 
                onPress={() => openOwnStatus(item)}
              >
                {item.isEncrypted && !getDisplayMediaUri(item) ? (
                  <View style={[styles.thumbPlaceholder, { backgroundColor: theme.backgroundSecondary }]}>
                    {undecryptable[item.id] ? (
                      <Feather name="lock" size={20} color={theme.textSecondary} />
                    ) : (
                      <ActivityIndicator color={theme.textSecondary} />
                    )}
                  </View>
                ) : getDisplayMediaUri(item) && mediaLoadFailed[item.id] ? (
                  <View style={[styles.thumbPlaceholder, { backgroundColor: theme.backgroundSecondary }]}>
                    <Feather name="alert-triangle" size={20} color={theme.textSecondary} />
                  </View>
                ) : getDisplayMediaUri(item) ? (
                  item.mediaType === 'video' ? (
                    <View style={styles.thumbImageContainer}>
                      <VideoThumb uri={getDisplayMediaUri(item) ?? ''} style={styles.thumbImage} />
                      <View style={styles.videoIndicator}>
                        <View style={styles.playIconCircle}>
                          <Feather name="play" size={14} color="#fff" />
                        </View>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.thumbImageContainer}>
                      <Image
                        source={{ uri: getDisplayMediaUri(item) ?? '' }}
                        style={styles.thumbImage}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                        onError={() => setMediaLoadFailed((prev) => ({ ...prev, [item.id]: true }))}
                      />
                    </View>
                  )
                ) : (
                  <View style={[styles.thumbPlaceholder, { backgroundColor: theme.backgroundSecondary }]}>
                    <Feather name="image" size={24} color={theme.textSecondary} />
                  </View>
                )}
                <View style={styles.thumbFooter}>
                  <Feather name="eye" size={12} color={theme.textSecondary} />
                  <ThemedText type="small" style={[styles.viewCount, { color: theme.textSecondary }]}>
                    {item.viewCount || 0}
                  </ThemedText>
                </View>
              </Pressable>
            )}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.myStatusListContent}
          />
        </View>
      ) : null}
    </View>
  );

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.content, { paddingTop: insets.top + Spacing.lg }]}>
        <View style={styles.header}>
          <ThemedText type="h2">Status</ThemedText>
        </View>

        {renderMyStatus()}

        <ThemedText type="small" style={[styles.sectionTitle, { color: theme.textSecondary }]}>
          Recent Updates
        </ThemedText>

        {isLoading ? (
          <ActivityIndicator size="large" color={theme.primary} style={styles.loader} />
        ) : statuses.length === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="eye-off" size={48} color={theme.textSecondary} />
            <ThemedText type="body" style={{ color: theme.textSecondary, marginTop: Spacing.md }}>
              No status updates yet
            </ThemedText>
          </View>
        ) : (
          <FlatList
            data={statuses}
            keyExtractor={(item) => item.id}
            renderItem={renderStatus}
            contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>

      <Modal
        visible={showCreateModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <View style={[styles.modalContainer, { backgroundColor: theme.backgroundRoot }]}>
          <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
            <Pressable onPress={() => { setShowCreateModal(false); resetCreateForm(); }}>
              <ThemedText type="body" style={{ color: theme.primary }}>Cancel</ThemedText>
            </Pressable>
            <ThemedText type="h3">Create Status</ThemedText>
            <Pressable onPress={uploadAndCreateStatus} disabled={isUploading}>
              {isUploading ? (
                <ActivityIndicator size="small" color={theme.primary} />
              ) : (
                <ThemedText type="body" style={{ color: theme.primary }}>Post</ThemedText>
              )}
            </Pressable>
          </View>

          <View style={styles.modalContent}>
            {selectedImage ? (
              selectedMediaType === "video" ? (
                <StatusVideoPreview 
                  uri={selectedImage} 
                  style={styles.previewImage} 
                  theme={theme}
                  onEditPress={() => pickImage(true)}
                />
              ) : (
                <View style={styles.previewContainer}>
                  <Image source={{ uri: selectedImage }} style={styles.previewImage} />
                  <Pressable 
                    style={[styles.imageEditButton, { backgroundColor: theme.primary }]}
                    onPress={() => pickImage(true)}
                  >
                    <Feather name="crop" size={18} color="#fff" />
                    <ThemedText type="small" style={{ color: '#fff', marginLeft: 4 }}>Edit</ThemedText>
                  </Pressable>
                </View>
              )
            ) : null}

            <Pressable
              style={[styles.privacySelector, { backgroundColor: theme.backgroundDefault }]}
              onPress={() => setShowPrivacyModal(true)}
            >
              <Feather name={getPrivacyIcon(privacy) as any} size={20} color={theme.primary} />
              <ThemedText type="body" style={styles.privacyText}>
                {getPrivacyLabel(privacy)}
              </ThemedText>
              <Feather name="chevron-right" size={20} color={theme.textSecondary} />
            </Pressable>

            {/* This story's audience is only encryptable when it's bounded
                to a specific set of people. 'Everyone' — both your account
                setting and this post — reaches anyone on the platform, so
                there's no fixed recipient list to encrypt to; be upfront
                about that rather than silently posting it in the clear. */}
            {(user?.storyPrivacyMode ?? "everyone") === "everyone" && privacy === "everyone" ? (
              <View style={styles.encryptionNotice}>
                <Feather name="unlock" size={13} color={theme.textSecondary} />
                <ThemedText type="small" style={{ color: theme.textSecondary, marginLeft: 6 }}>
                  Public — visible to anyone, not end-to-end encrypted
                </ThemedText>
              </View>
            ) : (
              <View style={styles.encryptionNotice}>
                <Feather name="lock" size={13} color={theme.textSecondary} />
                <ThemedText type="small" style={{ color: theme.textSecondary, marginLeft: 6 }}>
                  End-to-end encrypted for the people who can see it
                </ThemedText>
              </View>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={showPrivacyModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <View style={[styles.modalContainer, { backgroundColor: theme.backgroundRoot }]}>
          <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
            <Pressable onPress={() => setShowPrivacyModal(false)}>
              <ThemedText type="body" style={{ color: theme.primary }}>Done</ThemedText>
            </Pressable>
            <ThemedText type="h3">Privacy</ThemedText>
            <View style={{ width: 50 }} />
          </View>

          <View style={styles.privacyOptions}>
            {(["everyone", "friends", "custom"] as PrivacyOption[]).map((option) => (
              <Pressable
                key={option}
                style={[
                  styles.privacyOption,
                  { backgroundColor: theme.backgroundDefault },
                  privacy === option && { borderColor: theme.primary, borderWidth: 2 },
                ]}
                onPress={() => setPrivacy(option)}
              >
                <Feather name={getPrivacyIcon(option) as any} size={24} color={privacy === option ? theme.primary : theme.text} />
                <ThemedText type="body" style={styles.privacyOptionText}>
                  {getPrivacyLabel(option)}
                </ThemedText>
                {privacy === option ? (
                  <Feather name="check-circle" size={20} color={theme.primary} />
                ) : null}
              </Pressable>
            ))}

            {privacy === "custom" && friends.length > 0 ? (
              <View style={styles.friendsList}>
                <ThemedText type="small" style={[styles.sectionTitle, { color: theme.textSecondary }]}>
                  Select who can see
                </ThemedText>
                {friends.map((friend) => (
                  <Pressable
                    key={friend.id}
                    style={[styles.friendItem, { backgroundColor: theme.backgroundDefault }]}
                    onPress={() => toggleFriendSelection(friend.id)}
                  >
                    <View style={[styles.friendAvatar, { backgroundColor: theme.primary }]}>
                      {friend.avatarUrl ? (
                        <Image source={{ uri: friend.avatarUrl }} style={styles.friendAvatarImage} />
                      ) : (
                        <ThemedText type="small" style={{ color: "#fff" }}>
                          {friend.displayName?.charAt(0) || "?"}
                        </ThemedText>
                      )}
                    </View>
                    <ThemedText type="body" style={{ flex: 1 }}>
                      {friend.displayName || "Unknown"}
                    </ThemedText>
                    {selectedFriends.includes(friend.id) ? (
                      <Feather name="check-circle" size={20} color={theme.primary} />
                    ) : (
                      <Feather name="circle" size={20} color={theme.textSecondary} />
                    )}
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        </View>
      </Modal>

      <Modal
        visible={showStatusViewer}
        animationType="fade"
        presentationStyle="fullScreen"
      >
        <View style={[styles.statusViewerContainer, { backgroundColor: "#000" }]}>
          <View style={styles.statusViewerHeader}>
            <Pressable onPress={closeStatusViewer} style={styles.closeButton}>
              <Feather name="x" size={28} color="#fff" />
            </Pressable>
            <View style={{ flex: 1 }} />
            <Pressable 
              onPress={() => {
                if (!viewingStatus) return;
                const doDelete = () => deleteStatusMutation.mutate(viewingStatus.id);
                if (Platform.OS === "web") {
                  if (window.confirm("Are you sure you want to delete this status?")) {
                    doDelete();
                  }
                } else {
                  Alert.alert(
                    "Delete Status",
                    "Are you sure you want to delete this status?",
                    [
                      { text: "Cancel", style: "cancel" },
                      { text: "Delete", style: "destructive", onPress: doDelete }
                    ]
                  );
                }
              }}
              style={styles.deleteButton}
            >
              <Feather name="trash-2" size={24} color="#ff3b30" />
            </Pressable>
          </View>

          {viewingStatus?.isEncrypted && undecryptable[viewingStatus.id] ? (
            <View style={styles.statusImageContainer}>
              <Feather name="lock" size={40} color="#fff" />
              <ThemedText type="body" style={{ color: "#fff", marginTop: Spacing.md }}>
                Couldn't decrypt this story
              </ThemedText>
            </View>
          ) : viewingStatus && getDisplayMediaUri(viewingStatus) && mediaLoadFailed[viewingStatus.id] ? (
            <View style={styles.statusImageContainer}>
              <Feather name="alert-triangle" size={40} color="#fff" />
              <ThemedText type="body" style={{ color: "#fff", marginTop: Spacing.md }}>
                Couldn't load this story
              </ThemedText>
            </View>
          ) : viewingStatus && getDisplayMediaUri(viewingStatus) ? (
            viewingStatus.mediaType === "video" ? (
              <View style={styles.statusImageContainer}>
                <StatusVideoPlayer
                  uri={getDisplayMediaUri(viewingStatus) ?? ''}
                  style={styles.statusViewerImage}
                  onComplete={() => { viewCompletedRef.current = true; }}
                />
              </View>
            ) : (
              <View style={styles.statusImageContainer}>
                <Image
                  source={{ uri: getDisplayMediaUri(viewingStatus) ?? '' }}
                  style={styles.statusViewerImage}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                  placeholder={{ blurhash: 'L6PZfSi_.AyE_3t7t7R**0o#DgR4' }}
                  transition={200}
                  onError={() => setMediaLoadFailed((prev) => ({ ...prev, [viewingStatus.id]: true }))}
                />
              </View>
            )
          ) : (
            <View style={styles.statusImageContainer}>
              <ActivityIndicator size="large" color="#fff" />
              <ThemedText type="body" style={{ color: "#fff", marginTop: Spacing.md }}>
                Loading status...
              </ThemedText>
            </View>
          )}

          {viewingStatus && getDisplayCaption(viewingStatus) ? (
            <View style={[styles.statusViewerCaption, { bottom: 120 + insets.bottom }]}>
              <ThemedText type="body" style={{ color: "#fff" }}>
                {getDisplayCaption(viewingStatus)}
              </ThemedText>
            </View>
          ) : null}

          {viewingStatus && viewingStatus.userId === user?.id ? (
            <Pressable
              style={[styles.viewersButton, { bottom: 60 + insets.bottom }]}
              onPress={() => setShowViewersList(true)}
            >
              <Feather name="eye" size={20} color="#fff" />
              <ThemedText type="body" style={{ color: "#fff", marginLeft: Spacing.sm }}>
                {viewingStatus?.viewCount || 0} views
              </ThemedText>
              <Feather name="chevron-up" size={20} color="#fff" style={{ marginLeft: Spacing.xs }} />
            </Pressable>
          ) : viewingStatus ? (
            // Reply opens the existing chat with the status author so the
            // viewer can send a normal E2EE message. The server resolves
            // (or creates) the conversation; the reply itself is encrypted
            // client-side via the existing /api/messages pipeline.
            <Pressable
              style={[styles.replyButton, { bottom: 60 + insets.bottom }]}
              onPress={() => replyToStatus(viewingStatus)}
            >
              <Feather name="message-circle" size={20} color="#fff" />
              <ThemedText type="body" style={{ color: "#fff", marginLeft: Spacing.sm }}>
                Reply
              </ThemedText>
            </Pressable>
          ) : null}
        </View>
      </Modal>

      <StatusViewersModal
        visible={showViewersList}
        onClose={() => setShowViewersList(false)}
        statusId={viewingStatus?.id || ""}
        theme={theme}
      />

      <AdBanner />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  header: {
    marginBottom: Spacing.lg,
  },
  myStatusSection: {
    marginBottom: Spacing.xl,
  },
  addStatusButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    gap: Spacing.md,
  },
  addIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
  },
  addStatusText: {
    flex: 1,
    gap: 4,
  },
  myStatusList: {
    marginTop: Spacing.md,
  },
  myStatusHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  myStatusListContent: {
    gap: Spacing.sm,
  },
  myStatusThumb: {
    borderRadius: BorderRadius.md,
    overflow: "hidden",
    borderWidth: 2,
  },
  thumbImageContainer: {
    width: 100,
    height: 100,
    position: "relative",
  },
  thumbImage: {
    width: 100,
    height: 100,
  },
  thumbPlaceholder: {
    width: 100,
    height: 100,
    justifyContent: "center",
    alignItems: "center",
  },
  videoIndicator: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  playIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    paddingLeft: 2,
  },
  thumbFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.xs,
    gap: 4,
  },
  viewCount: {
    fontSize: 11,
  },
  sectionTitle: {
    marginBottom: Spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  loader: {
    marginTop: Spacing.xl,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    marginTop: Spacing["3xl"],
  },
  statusCard: {
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
    overflow: "hidden",
    height: 200,
  },
  statusImage: {
    width: "100%",
    height: "100%",
  },
  feedVideoBadge: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.15)",
  },
  statusPlaceholder: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  statusOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.md,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  statusHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarImage: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  avatarText: {
    color: "#fff",
    fontWeight: "600",
  },
  statusName: {
    color: "#fff",
    fontWeight: "600",
  },
  caption: {
    color: "#fff",
    marginTop: Spacing.xs,
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: Spacing.lg,
    borderBottomWidth: 1,
  },
  modalContent: {
    flex: 1,
    padding: Spacing.lg,
  },
  previewImage: {
    width: "100%",
    // Match the 9:16 crop the picker already applies (aspect: [9, 16] in
    // pickImage) — the previous fixed height:300 squashed/cropped an
    // already-correctly-cropped 9:16 image into an unrelated box shape.
    aspectRatio: 9 / 16,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.lg,
  },
  previewContainer: {
    position: 'relative',
    marginBottom: Spacing.lg,
  },
  imageEditButton: {
    position: 'absolute',
    bottom: Spacing.md + Spacing.lg,
    right: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  privacySelector: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  privacyText: {
    flex: 1,
  },
  encryptionNotice: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.xs,
  },
  privacyOptions: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  privacyOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    gap: Spacing.md,
  },
  privacyOptionText: {
    flex: 1,
  },
  friendsList: {
    marginTop: Spacing.lg,
  },
  friendItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
  },
  friendAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  friendAvatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  statusViewerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  statusViewerHeader: {
    position: "absolute",
    top: 60,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    zIndex: 10,
  },
  closeButton: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  deleteButton: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  statusViewerImage: {
    width: "100%",
    height: "100%",
  },
  statusImageContainer: {
    flex: 1,
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  statusViewerCaption: {
    position: "absolute",
    bottom: 120,
    left: Spacing.lg,
    right: Spacing.lg,
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  viewersButton: {
    position: "absolute",
    bottom: 60,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  replyButton: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  cropToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
});
