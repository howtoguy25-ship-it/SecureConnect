import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  Alert,
  Image,
  ActivityIndicator,
  ScrollView,
  TextInput,
  Modal,
} from "react-native";
import {
  CameraView,
  useCameraPermissions,
  useMicrophonePermissions,
  CameraType,
  CameraMode,
} from "expo-camera";
import { useVideoPlayer, VideoView } from "expo-video";
import * as Sharing from "expo-sharing";
import * as ImageManipulator from "expo-image-manipulator";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Linking from "expo-linking";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { getApiUrl } from "@/lib/query-client";
import { getStoredToken } from "@/lib/auth";
import { haptics } from "@/lib/haptics";
import { useAuth } from "@/contexts/AuthContext";
import {
  uploadEncryptedMedia,
  buildMediaEnvelope,
} from "@/utils/crypto/encryptedMediaClient";
import { encryptMessage as signalEncrypt } from "@/utils/crypto/signalProtocol";
import { sendEncryptedToRecipient } from "@/lib/sealedSender";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface Conversation {
  id: string;
  otherUserId: string;
  otherUserName: string;
  otherUserAvatar: number;
}

const AVATAR_COLORS = [
  "#8B5CF6", "#EC4899", "#F59E0B", "#10B981", "#3B82F6",
  "#EF4444", "#6366F1", "#14B8A6", "#F97316", "#84CC16",
];

const MAX_VIDEO_SECONDS = 60;

// null aspect = "Original" (no crop, restores the uncropped source).
const CROP_PRESETS: { label: string; aspect: number | null }[] = [
  { label: "Original", aspect: null },
  { label: "Square", aspect: 1 },
  { label: "Portrait", aspect: 4 / 5 },
  { label: "Wide", aspect: 16 / 9 },
];

export default function CameraScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const [facing, setFacing] = useState<CameraType>("back");
  const [mode, setMode] = useState<CameraMode>("picture");
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [capturedVideo, setCapturedVideo] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [isSharing, setIsSharing] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [caption, setCaption] = useState("");
  const [showCropModal, setShowCropModal] = useState(false);
  const [cropSourceUri, setCropSourceUri] = useState<string | null>(null);
  const [cropPreviewUri, setCropPreviewUri] = useState<string | null>(null);
  const [selectedCropAspect, setSelectedCropAspect] = useState<number | null>(null);
  const [isCropping, setIsCropping] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const recordingTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Video preview player — passing null avoids the invalid empty-string
  // source state at first mount before any video is captured.
  const videoPlayer = useVideoPlayer(capturedVideo, (player) => {
    if (capturedVideo) {
      player.loop = true;
      player.play();
    }
  });

  const { data: conversations = [] } = useQuery<Conversation[]>({
    queryKey: ["/api/conversations"],
  });

  useEffect(() => {
    return () => {
      if (recordingTimer.current) {
        clearInterval(recordingTimer.current);
      }
    };
  }, []);

  const handleCapturePhoto = async () => {
    if (!cameraRef.current || isCapturing) return;
    setIsCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      if (photo?.uri) {
        haptics.medium();
        setCapturedPhoto(photo.uri);
        setSelectedRecipients([]);
        setCaption("");
      }
    } catch (error) {
      console.error("Failed to capture photo:", error);
      Alert.alert("Error", "Failed to capture photo. Please try again.");
    } finally {
      setIsCapturing(false);
    }
  };

  const ensureMicPermission = async (): Promise<boolean> => {
    if (micPermission?.granted) return true;
    if (micPermission?.status === "denied" && !micPermission?.canAskAgain) {
      Alert.alert(
        "Microphone Permission Needed",
        "Video recording needs microphone access. Please enable it in Settings.",
        [
          { text: "Cancel", style: "cancel" },
          ...(Platform.OS !== "web"
            ? [{ text: "Open Settings", onPress: () => Linking.openSettings().catch(() => {}) }]
            : []),
        ],
      );
      return false;
    }
    const r = await requestMicPermission();
    return r.granted;
  };

  const handleStartRecording = async () => {
    if (!cameraRef.current || isRecording) return;
    if (Platform.OS === "web") {
      Alert.alert(
        "Video Recording Not Available",
        "Video recording works in Expo Go on your phone. Scan the QR code from the Replit URL bar to try it.",
      );
      return;
    }
    const micOk = await ensureMicPermission();
    if (!micOk) return;

    setIsRecording(true);
    setRecordingDuration(0);
    haptics.heavy();
    recordingTimer.current = setInterval(() => {
      setRecordingDuration((prev) => {
        const next = prev + 1;
        if (next >= MAX_VIDEO_SECONDS) {
          handleStopRecording();
        }
        return next;
      });
    }, 1000);

    try {
      const video = await cameraRef.current.recordAsync({
        maxDuration: MAX_VIDEO_SECONDS,
      });
      if (video?.uri) {
        setCapturedVideo(video.uri);
        setSelectedRecipients([]);
        setCaption("");
      }
    } catch (error) {
      console.error("Failed to record video:", error);
      Alert.alert("Error", "Failed to record video. Please try again.");
    } finally {
      setIsRecording(false);
      if (recordingTimer.current) {
        clearInterval(recordingTimer.current);
        recordingTimer.current = null;
      }
    }
  };

  const handleStopRecording = () => {
    if (!cameraRef.current || !isRecording) return;
    try {
      cameraRef.current.stopRecording();
      haptics.medium();
    } catch (error) {
      console.error("Failed to stop recording:", error);
    }
  };

  const handleCaptureButtonPress = () => {
    if (mode === "picture") {
      handleCapturePhoto();
    } else if (isRecording) {
      handleStopRecording();
    } else {
      handleStartRecording();
    }
  };

  const handleRetake = () => {
    setCapturedPhoto(null);
    setCapturedVideo(null);
    setSelectedRecipients([]);
    setCaption("");
  };

  // Real pixel crop via expo-image-manipulator, not a fake visual overlay.
  // Presets are deterministic (largest centered rect at the chosen aspect)
  // rather than a free-drag crop frame — that avoids the real risk of a
  // hand-rolled pan/pinch-to-crop transform silently mismapping screen
  // gesture coordinates to source-image pixels and cropping the wrong area,
  // which would be worse than no crop feature at all. Each preset tap
  // applies the actual crop immediately so what's previewed is exactly
  // what gets saved and sent.
  const getImageSize = (uri: string): Promise<{ width: number; height: number }> =>
    new Promise((resolve, reject) => {
      Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
    });

  const applyCropPreset = async (aspect: number | null) => {
    if (!cropSourceUri) return;
    setIsCropping(true);
    try {
      if (aspect === null) {
        setCropPreviewUri(cropSourceUri);
        setSelectedCropAspect(null);
        return;
      }
      const { width: imgW, height: imgH } = await getImageSize(cropSourceUri);
      const currentAspect = imgW / imgH;
      let cropW: number;
      let cropH: number;
      if (currentAspect > aspect) {
        cropH = imgH;
        cropW = imgH * aspect;
      } else {
        cropW = imgW;
        cropH = imgW / aspect;
      }
      const originX = Math.round((imgW - cropW) / 2);
      const originY = Math.round((imgH - cropH) / 2);
      const result = await ImageManipulator.manipulateAsync(
        cropSourceUri,
        [{ crop: { originX, originY, width: Math.round(cropW), height: Math.round(cropH) } }],
        { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG },
      );
      setCropPreviewUri(result.uri);
      setSelectedCropAspect(aspect);
    } catch (error) {
      console.error('Failed to apply crop:', error);
      Alert.alert('Crop Failed', 'Could not crop this photo. Please try again.');
    } finally {
      setIsCropping(false);
    }
  };

  const openCropModal = () => {
    if (!capturedPhoto) return;
    setCropSourceUri(capturedPhoto);
    setCropPreviewUri(capturedPhoto);
    setSelectedCropAspect(null);
    setShowCropModal(true);
  };

  const handleSaveCrop = () => {
    if (cropPreviewUri) {
      setCapturedPhoto(cropPreviewUri);
      haptics.success();
    }
    setShowCropModal(false);
  };

  const handleCancelCrop = () => {
    setShowCropModal(false);
    setCropPreviewUri(null);
    setCropSourceUri(null);
  };

  const capturedUri = capturedPhoto || capturedVideo;
  const capturedKind: "image" | "video" | null = capturedPhoto
    ? "image"
    : capturedVideo
      ? "video"
      : null;

  const handleShare = async () => {
    if (!capturedUri) return;
    if (Platform.OS === "web") {
      Alert.alert("Share", "Sharing is not available on web. Please use Expo Go on your device.");
      return;
    }
    setIsSharing(true);
    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(capturedUri, {
          mimeType: capturedKind === "video" ? "video/mp4" : "image/jpeg",
          dialogTitle: capturedKind === "video" ? "Share your video" : "Share your photo",
        });
      } else {
        Alert.alert("Share", "Sharing is not available on this device.");
      }
    } catch (error) {
      console.error("Failed to share:", error);
    } finally {
      setIsSharing(false);
    }
  };

  const toggleRecipient = (recipientId: string) => {
    setSelectedRecipients((prev) =>
      prev.includes(recipientId)
        ? prev.filter((id) => id !== recipientId)
        : [...prev, recipientId],
    );
  };

  const handleSendToSelected = async () => {
    if (!capturedUri || !capturedKind || selectedRecipients.length === 0) return;
    setIsSending(true);
    try {
      const token = await getStoredToken();
      if (!token) {
        Alert.alert("Error", "Please log in again.");
        setIsSending(false);
        return;
      }
      const baseUrl = getApiUrl();

      // Every captured photo/video is encrypted client-side and sent
      // through the same SCM1-envelope + Signal-ciphertext path
      // ConversationScreen uses, regardless of number preference --
      // sendEncryptedToRecipient itself decides sealed vs legacy /api/messages
      // transport internally. There used to be a separate "personal mode"
      // fallback here that uploaded via FileSystem.uploadAsync() (unreliable
      // against GCS's V4-signed PUT URLs -- the same bug already fixed in
      // StatusScreen/encryptedMediaClient) AND sent the message as
      // plaintext with no encryption at all. Since personal-mode is the
      // default for most accounts, that fallback was actually the common
      // path, not an edge case.
      let okCount = 0;
      for (const recipientId of selectedRecipients) {
        const conversation = conversations.find((c) => c.otherUserId === recipientId);
        if (!conversation) continue;
        try {
          const { envelope } = await uploadEncryptedMedia({
            uri: capturedUri,
            mediaType: capturedKind,
            token,
            apiBaseUrl: baseUrl,
          });
          const envelopeText = buildMediaEnvelope(envelope);
          const payload = caption ? `${envelopeText}\n${caption}` : envelopeText;
          const outgoing = await signalEncrypt(user?.id ?? "", recipientId, payload);
          const result = await sendEncryptedToRecipient({
            currentUser: user,
            conversationId: conversation.id,
            receiverId: recipientId,
            ciphertext: outgoing.ciphertext,
            encryptionVersion: outgoing.encryptionVersion,
            e2eeInitEnvelope: outgoing.e2eeInitEnvelope,
          });
          if (result.ok) okCount++;
        } catch (perRecipientErr) {
          console.error("encrypted camera media send failed:", perRecipientErr);
        }
      }
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      const recipientNames = selectedRecipients
        .map((id) => conversations.find((c) => c.otherUserId === id)?.otherUserName || "User")
        .join(", ");
      if (okCount === 0) {
        Alert.alert("Error", `Failed to send ${capturedKind}. Please try again.`);
      } else {
        Alert.alert(
          "Sent",
          `${capturedKind === "video" ? "Video" : "Photo"} sent to ${recipientNames}!`,
          [{ text: "OK", onPress: () => navigation.goBack() }],
        );
      }
    } catch (error) {
      console.error("Failed to send media:", error);
      Alert.alert("Error", `Failed to send ${capturedKind}. Please try again.`);
    } finally {
      setIsSending(false);
    }
  };

  const toggleCameraFacing = () => {
    if (isRecording) return;
    setFacing((current) => (current === "back" ? "front" : "back"));
  };

  const formatDuration = (s: number) => {
    const mm = Math.floor(s / 60).toString().padStart(2, "0");
    const ss = (s % 60).toString().padStart(2, "0");
    return `${mm}:${ss}`;
  };

  if (!permission) {
    return (
      <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  if (!permission.granted) {
    if (permission.status === "denied" && !permission.canAskAgain) {
      return (
        <View style={[styles.container, styles.centered, { backgroundColor: theme.backgroundRoot }]}>
          <Feather name="camera-off" size={64} color={theme.textSecondary} />
          <Text style={[styles.permissionTitle, { color: theme.text }]}>Camera Access Required</Text>
          <Text style={[styles.permissionText, { color: theme.textSecondary }]}>
            Please enable camera access in your device settings to use this feature.
          </Text>
          {Platform.OS !== "web" && (
            <Pressable
              style={[styles.settingsButton, { backgroundColor: theme.primary }]}
              onPress={async () => {
                try {
                  await Linking.openSettings();
                } catch (error) {
                  console.error("Cannot open settings:", error);
                }
              }}
            >
              <Text style={styles.settingsButtonText}>Open Settings</Text>
            </Pressable>
          )}
          <Pressable
            style={[styles.backButton, { borderColor: theme.border }]}
            onPress={() => navigation.goBack()}
          >
            <Text style={[styles.backButtonText, { color: theme.text }]}>Go Back</Text>
          </Pressable>
        </View>
      );
    }
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.backgroundRoot }]}>
        <Feather name="camera" size={64} color={theme.primary} />
        <Text style={[styles.permissionTitle, { color: theme.text }]}>Camera Permission Needed</Text>
        <Text style={[styles.permissionText, { color: theme.textSecondary }]}>
          We need camera access to let you take photos and record videos.
        </Text>
        <Pressable
          style={[styles.enableButton, { backgroundColor: theme.primary }]}
          onPress={requestPermission}
        >
          <Text style={styles.enableButtonText}>Enable Camera</Text>
        </Pressable>
      </View>
    );
  }

  if (capturedUri) {
    return (
      <View style={[styles.container, { backgroundColor: "#000" }]}>
        {capturedKind === "video" ? (
          <VideoView
            style={styles.preview}
            player={videoPlayer}
            contentFit="contain"
            allowsFullscreen={false}
            allowsPictureInPicture={false}
            nativeControls={false}
          />
        ) : (
          <Image source={{ uri: capturedUri }} style={styles.preview} resizeMode="contain" />
        )}

        <View style={[styles.previewOverlay, { paddingBottom: insets.bottom + Spacing.lg }]}>
          <View style={styles.captionRow}>
            <TextInput
              style={styles.captionInput}
              placeholder="Add a caption..."
              placeholderTextColor="rgba(255,255,255,0.6)"
              value={caption}
              onChangeText={setCaption}
              multiline
            />
          </View>

          {conversations.length > 0 ? (
            <>
              <Text style={styles.sendToLabel}>
                Send to ({selectedRecipients.length} selected)
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.recipientList}
              >
                {conversations.map((conv) => {
                  const isSelected = selectedRecipients.includes(conv.otherUserId);
                  const avatarColor = AVATAR_COLORS[conv.otherUserAvatar % AVATAR_COLORS.length];
                  return (
                    <Pressable
                      key={conv.id}
                      style={[styles.recipientItem, isSelected && styles.recipientItemSelected]}
                      onPress={() => toggleRecipient(conv.otherUserId)}
                    >
                      <View style={[styles.recipientAvatar, { backgroundColor: avatarColor }]}>
                        <Text style={styles.recipientAvatarText}>
                          {(conv.otherUserName || "?").charAt(0).toUpperCase()}
                        </Text>
                        {isSelected ? (
                          <View style={styles.checkBadge}>
                            <Feather name="check" size={10} color="#fff" />
                          </View>
                        ) : null}
                      </View>
                      <Text style={styles.recipientName} numberOfLines={1}>
                        {conv.otherUserName || "User"}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </>
          ) : (
            <Text style={styles.noConversationsText}>
              Start a conversation first to send media
            </Text>
          )}

          <View style={styles.actionRow}>
            <Pressable
              style={[styles.actionButton, { backgroundColor: "rgba(255,255,255,0.2)" }]}
              onPress={handleRetake}
            >
              <Feather name="refresh-cw" size={20} color="#FFFFFF" />
              <Text style={styles.actionButtonText}>Retake</Text>
            </Pressable>

            {capturedKind === "image" ? (
              <Pressable
                style={[styles.actionButton, { backgroundColor: "rgba(255,255,255,0.2)" }]}
                onPress={openCropModal}
              >
                <Feather name="crop" size={20} color="#FFFFFF" />
                <Text style={styles.actionButtonText}>Crop</Text>
              </Pressable>
            ) : null}

            {selectedRecipients.length > 0 ? (
              <Pressable
                style={[styles.actionButton, styles.sendButton, { backgroundColor: theme.primary }]}
                onPress={handleSendToSelected}
                disabled={isSending}
              >
                {isSending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Feather name="send" size={20} color="#FFFFFF" />
                )}
                <Text style={styles.actionButtonText}>
                  Send ({selectedRecipients.length})
                </Text>
              </Pressable>
            ) : null}

            <Pressable
              style={[styles.actionButton, { backgroundColor: "rgba(255,255,255,0.2)" }]}
              onPress={handleShare}
              disabled={isSharing}
            >
              {isSharing ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Feather name="share-2" size={20} color="#FFFFFF" />
              )}
              <Text style={styles.actionButtonText}>Share</Text>
            </Pressable>
          </View>
        </View>

        <Pressable
          style={[styles.closeButton, { top: insets.top + Spacing.md }]}
          onPress={() => navigation.goBack()}
        >
          <Feather name="x" size={24} color="#FFFFFF" />
        </Pressable>

        <Modal visible={showCropModal} animationType="slide" transparent={false}>
          <View style={[styles.container, { backgroundColor: "#000" }]}>
            <View style={styles.cropPreviewWrap}>
              {isCropping ? (
                <ActivityIndicator size="large" color="#FFFFFF" />
              ) : cropPreviewUri ? (
                <Image source={{ uri: cropPreviewUri }} style={styles.preview} resizeMode="contain" />
              ) : null}
            </View>

            <View style={[styles.cropControls, { paddingBottom: insets.bottom + Spacing.lg }]}>
              <View style={styles.cropAspectRow}>
                {CROP_PRESETS.map((preset) => (
                  <Pressable
                    key={preset.label}
                    style={[
                      styles.cropAspectButton,
                      selectedCropAspect === preset.aspect && { backgroundColor: theme.primary },
                    ]}
                    onPress={() => applyCropPreset(preset.aspect)}
                    disabled={isCropping}
                  >
                    <Text style={styles.cropAspectButtonText}>{preset.label}</Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.actionRow}>
                <Pressable
                  style={[styles.actionButton, { backgroundColor: "rgba(255,255,255,0.2)" }]}
                  onPress={handleCancelCrop}
                >
                  <Feather name="x" size={20} color="#FFFFFF" />
                  <Text style={styles.actionButtonText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.actionButton, styles.sendButton, { backgroundColor: theme.primary }]}
                  onPress={handleSaveCrop}
                  disabled={isCropping || !cropPreviewUri}
                >
                  <Feather name="check" size={20} color="#FFFFFF" />
                  <Text style={styles.actionButtonText}>Save</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing={facing}
        mode={mode}
        videoQuality="720p"
      >
        <Pressable
          style={[styles.closeButton, { top: insets.top + Spacing.md }]}
          onPress={() => navigation.goBack()}
        >
          <Feather name="x" size={24} color="#FFFFFF" />
        </Pressable>

        {/* Recording indicator */}
        {isRecording ? (
          <View style={[styles.recordingBadge, { top: insets.top + Spacing.md }]}>
            <View style={styles.recordingDot} />
            <Text style={styles.recordingText}>{formatDuration(recordingDuration)}</Text>
          </View>
        ) : null}

        <View style={[styles.cameraControls, { paddingBottom: insets.bottom + Spacing.xl }]}>
          {/* Mode pill — Photo / Video */}
          {!isRecording ? (
            <View style={styles.modeRow}>
              <Pressable
                style={[
                  styles.modeChip,
                  mode === "picture" && { backgroundColor: "rgba(255,255,255,0.95)" },
                ]}
                onPress={() => setMode("picture")}
              >
                <Text
                  style={[
                    styles.modeChipText,
                    { color: mode === "picture" ? "#000" : "#fff" },
                  ]}
                >
                  Photo
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.modeChip,
                  mode === "video" && { backgroundColor: "rgba(255,255,255,0.95)" },
                ]}
                onPress={() => setMode("video")}
              >
                <Text
                  style={[
                    styles.modeChipText,
                    { color: mode === "video" ? "#000" : "#fff" },
                  ]}
                >
                  Video
                </Text>
              </Pressable>
            </View>
          ) : null}

          <View style={styles.controlsRow}>
            <View style={styles.controlPlaceholder} />

            <Pressable
              style={[
                styles.captureButton,
                isRecording && styles.captureButtonRecording,
                isCapturing && styles.captureButtonActive,
              ]}
              onPress={handleCaptureButtonPress}
              disabled={isCapturing}
            >
              {isCapturing ? (
                <ActivityIndicator size="small" color="#000" />
              ) : isRecording ? (
                <View style={styles.captureButtonStop} />
              ) : mode === "video" ? (
                <View style={styles.captureButtonVideoInner} />
              ) : (
                <View style={styles.captureButtonInner} />
              )}
            </Pressable>

            <Pressable
              style={[styles.flipButton, isRecording && { opacity: 0.4 }]}
              onPress={toggleCameraFacing}
              disabled={isRecording}
            >
              <Feather name="refresh-cw" size={24} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { justifyContent: "center", alignItems: "center", padding: Spacing.xl },
  camera: { flex: 1 },
  preview: { flex: 1 },
  closeButton: {
    position: "absolute",
    left: Spacing.lg,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  recordingBadge: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    zIndex: 10,
  },
  recordingDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#FF3B30" },
  recordingText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  cameraControls: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.xl,
  },
  modeRow: {
    flexDirection: "row",
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: BorderRadius.full,
    padding: 4,
    marginBottom: Spacing.lg,
    gap: 4,
  },
  modeChip: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
  },
  modeChipText: { fontSize: 14, fontWeight: "600" },
  controlsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  controlPlaceholder: { width: 44 },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 4,
    borderColor: "rgba(255,255,255,0.5)",
  },
  captureButtonRecording: {
    borderColor: "rgba(255, 59, 48, 0.6)",
  },
  captureButtonActive: { opacity: 0.7 },
  captureButtonInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#FFFFFF",
  },
  captureButtonVideoInner: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#FF3B30",
  },
  captureButtonStop: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: "#FF3B30",
  },
  flipButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  previewOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.85)",
    paddingTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
  },
  captionRow: { marginBottom: Spacing.lg },
  captionInput: {
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    color: "#FFFFFF",
    fontSize: 16,
    minHeight: 44,
  },
  sendToLabel: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: Spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  recipientList: { paddingBottom: Spacing.lg, gap: Spacing.md },
  recipientItem: { alignItems: "center", width: 70 },
  recipientItemSelected: { opacity: 1 },
  recipientAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.xs,
  },
  recipientAvatarText: { color: "#FFFFFF", fontSize: 18, fontWeight: "600" },
  checkBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#10B981",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#000",
  },
  recipientName: {
    color: "#FFFFFF",
    fontSize: 12,
    textAlign: "center",
    fontWeight: "500",
  },
  noConversationsText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 14,
    textAlign: "center",
    paddingVertical: Spacing.lg,
  },
  actionRow: { flexDirection: "row", justifyContent: "center", gap: Spacing.md },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.full,
    gap: Spacing.sm,
  },
  sendButton: { flex: 1, justifyContent: "center" },
  actionButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
  cropPreviewWrap: { flex: 1, justifyContent: "center", alignItems: "center" },
  cropControls: { paddingHorizontal: Spacing.lg, gap: Spacing.md },
  cropAspectRow: { flexDirection: "row", justifyContent: "center", gap: Spacing.sm },
  cropAspectButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  cropAspectButtonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "600" },
  permissionTitle: {
    fontSize: 22,
    fontWeight: "700",
    marginTop: Spacing.lg,
    textAlign: "center",
  },
  permissionText: {
    fontSize: 16,
    marginTop: Spacing.sm,
    textAlign: "center",
    lineHeight: 22,
  },
  enableButton: {
    marginTop: Spacing.xl,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.lg,
  },
  enableButtonText: { color: "#FFFFFF", fontSize: 17, fontWeight: "600" },
  settingsButton: {
    marginTop: Spacing.xl,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.lg,
  },
  settingsButtonText: { color: "#FFFFFF", fontSize: 17, fontWeight: "600" },
  backButton: {
    marginTop: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
  },
  backButtonText: { fontSize: 17, fontWeight: "600" },
});
