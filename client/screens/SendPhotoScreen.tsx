import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  FlatList,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { getApiUrl, apiRequest } from "@/lib/query-client";
import { getStoredToken } from "@/lib/auth";
import * as FileSystem from "expo-file-system/legacy";
import { useAuth } from "@/contexts/AuthContext";
import {
  E2EE_MEDIA_ENABLED,
  uploadEncryptedMedia,
  buildMediaEnvelope,
} from "@/utils/crypto/encryptedMediaClient";
import { encryptMessage as signalEncrypt } from "@/utils/crypto/signalProtocol";
import { sendEncryptedToRecipient } from "@/lib/sealedSender";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type SendPhotoRouteProp = RouteProp<RootStackParamList, "SendPhoto">;

interface Contact {
  id: string;
  phoneNumber: string;
  displayName: string | null;
  avatarIndex: number;
}

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

export default function SendPhotoScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<SendPhotoRouteProp>();
  const queryClient = useQueryClient();
  const { photoUri } = route.params;
  const { user } = useAuth();

  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [caption, setCaption] = useState("");
  const [isSending, setIsSending] = useState(false);

  const { data: conversations = [] } = useQuery<Conversation[]>({
    queryKey: ["/api/conversations"],
  });

  const toggleRecipient = (recipientId: string) => {
    setSelectedRecipients((prev) =>
      prev.includes(recipientId)
        ? prev.filter((id) => id !== recipientId)
        : [...prev, recipientId]
    );
  };

  const handleSend = async () => {
    if (selectedRecipients.length === 0) {
      Alert.alert("Select Recipients", "Please select at least one person to send the photo to.");
      return;
    }

    setIsSending(true);

    try {
      const token = await getStoredToken();
      if (!token) {
        Alert.alert("Error", "Please log in again.");
        setIsSending(false);
        return;
      }

      const baseUrl = getApiUrl();

      // Item 4b — encrypted+sealed media path for sealed-mode users.
      // Previously this screen ALWAYS POSTed plaintext (mediaUrl + caption)
      // to /api/messages, which (1) put the mediaUrl on the wire and (2)
      // carried the sender's userId on the row even when the user was in
      // sealed-mode. We now mirror the ConversationScreen path: upload an
      // SCM1-encrypted blob, wrap the envelope in Signal ciphertext, and
      // route through the sealed/legacy helper. Personal-mode senders
      // (no active VN) fall through to the original plaintext path below.
      const userIsSealedCapable =
        user?.preferredNumberType === "app" &&
        !!user?.virtualNumber &&
        user.virtualNumber.status === "active";

      if (E2EE_MEDIA_ENABLED && userIsSealedCapable) {
        let okCount = 0;
        for (const recipientId of selectedRecipients) {
          const conversation = conversations.find((c) => c.otherUserId === recipientId);
          if (!conversation) continue;
          try {
            const { envelope } = await uploadEncryptedMedia({
              uri: photoUri,
              mediaType: "image",
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
            console.error("encrypted photo send failed:", perRecipientErr);
          }
        }
        queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
        if (okCount === 0) {
          Alert.alert("Error", "Failed to send photo. Please try again.");
        } else {
          Alert.alert(
            "Sent",
            `Photo sent to ${okCount} of ${selectedRecipients.length} chat${selectedRecipients.length === 1 ? "" : "s"}.`,
            [{ text: "OK", onPress: () => navigation.goBack() }],
          );
        }
        setIsSending(false);
        return;
      }

      const uploadUrlResponse = await fetch(new URL("/api/objects/upload", baseUrl), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!uploadUrlResponse.ok) {
        throw new Error("Failed to get upload URL");
      }

      const { uploadURL } = await uploadUrlResponse.json();

      const fileInfo = await FileSystem.getInfoAsync(photoUri);
      if (!fileInfo.exists) {
        throw new Error("Photo file not found");
      }

      const uploadResult = await FileSystem.uploadAsync(uploadURL, photoUri, {
        httpMethod: "PUT",
        uploadType: 1,
        headers: {
          "Content-Type": "image/jpeg",
        },
      });

      if (uploadResult.status < 200 || uploadResult.status >= 300) {
        throw new Error("Failed to upload photo");
      }

      const mediaUrl = uploadURL.split("?")[0];

      const aclResponse = await fetch(new URL("/api/objects/media", baseUrl), {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ mediaURL: mediaUrl }),
      });

      if (!aclResponse.ok) {
        throw new Error("Failed to set media permissions");
      }

      const { objectPath } = await aclResponse.json();

      for (const recipientId of selectedRecipients) {
        const conversation = conversations.find((c) => c.otherUserId === recipientId);
        if (!conversation) continue;

        await apiRequest("POST", "/api/messages", {
          conversationId: conversation.id,
          receiverId: recipientId,
          content: caption || "",
          mediaUrl: objectPath,
          mediaType: "image",
        });
      }

      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });

      Alert.alert("Sent", "Your photo has been sent successfully!", [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    } catch (error) {
      console.error("Failed to send photo:", error);
      Alert.alert("Error", "Failed to send photo. Please try again.");
    } finally {
      setIsSending(false);
    }
  };

  const renderRecipient = ({ item }: { item: Conversation }) => {
    const isSelected = selectedRecipients.includes(item.otherUserId);
    const avatarColor = AVATAR_COLORS[item.otherUserAvatar % AVATAR_COLORS.length];

    return (
      <Pressable
        style={[
          styles.recipientItem,
          { backgroundColor: theme.backgroundSecondary },
          isSelected && { borderColor: theme.primary, borderWidth: 2 },
        ]}
        onPress={() => toggleRecipient(item.otherUserId)}
      >
        <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
          <Text style={styles.avatarText}>
            {(item.otherUserName || "?").charAt(0).toUpperCase()}
          </Text>
        </View>
        <Text
          style={[styles.recipientName, { color: theme.text }]}
          numberOfLines={1}
        >
          {item.otherUserName || "Unknown"}
        </Text>
        {isSelected && (
          <View style={[styles.checkmark, { backgroundColor: theme.primary }]}>
            <Feather name="check" size={14} color="#FFFFFF" />
          </View>
        )}
      </Pressable>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Pressable style={styles.headerButton} onPress={() => navigation.goBack()}>
          <Feather name="x" size={24} color={theme.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Send Photo</Text>
        <Pressable
          style={[
            styles.sendButton,
            { backgroundColor: selectedRecipients.length > 0 ? theme.primary : theme.backgroundSecondary },
          ]}
          onPress={handleSend}
          disabled={isSending || selectedRecipients.length === 0}
        >
          {isSending ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Feather name="send" size={18} color={selectedRecipients.length > 0 ? "#FFFFFF" : theme.textSecondary} />
          )}
        </Pressable>
      </View>

      <View style={styles.previewContainer}>
        <Image source={{ uri: photoUri }} style={styles.preview} resizeMode="cover" />
      </View>

      <View style={[styles.captionContainer, { backgroundColor: theme.backgroundSecondary }]}>
        <TextInput
          style={[styles.captionInput, { color: theme.text }]}
          placeholder="Add a caption..."
          placeholderTextColor={theme.textSecondary}
          value={caption}
          onChangeText={setCaption}
          multiline
        />
      </View>

      <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
        SEND TO ({selectedRecipients.length} selected)
      </Text>

      <FlatList
        data={conversations}
        renderItem={renderRecipient}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.recipientList}
        ListEmptyComponent={
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            Start a conversation first to send photos
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  headerButton: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  previewContainer: {
    height: 250,
    marginHorizontal: Spacing.lg,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  preview: {
    width: "100%",
    height: "100%",
  },
  captionContainer: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  captionInput: {
    fontSize: 16,
    minHeight: 40,
    maxHeight: 100,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.5,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  recipientList: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  recipientItem: {
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginRight: Spacing.sm,
    width: 100,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  avatarText: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "600",
  },
  recipientName: {
    fontSize: 14,
    fontWeight: "500",
    textAlign: "center",
  },
  checkmark: {
    position: "absolute",
    top: Spacing.sm,
    right: Spacing.sm,
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    fontSize: 14,
    textAlign: "center",
    padding: Spacing.lg,
  },
});
