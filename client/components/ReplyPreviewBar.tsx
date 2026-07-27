import React from "react";
import { Pressable, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { Spacing } from "@/constants/theme";

interface ReplyMessage {
  id: string;
  senderId: string;
  content: string | null;
  mediaType?: string | null;
}

interface ReplyPreviewBarProps {
  replyTo: ReplyMessage | null;
  currentUserId: string | undefined;
  otherUserName: string;
  decryptedCache: Record<string, string | null>;
  tryDecrypt: (content: string | null, msgId?: string) => string | null;
  theme: any;
  onClose: () => void;
}

export function ReplyPreviewBar({
  replyTo,
  currentUserId,
  otherUserName,
  decryptedCache,
  tryDecrypt,
  theme,
  onClose,
}: ReplyPreviewBarProps) {
  if (!replyTo) return null;
  const preview =
    decryptedCache[replyTo.id] ??
    tryDecrypt(replyTo.content, replyTo.id) ??
    (replyTo.mediaType ? `[${replyTo.mediaType}]` : "");
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        borderLeftWidth: 3,
        borderLeftColor: theme.primary,
        backgroundColor: theme.backgroundSecondary,
        marginHorizontal: Spacing.sm,
        marginBottom: Spacing.xs,
        borderRadius: 8,
      }}
    >
      <View style={{ flex: 1 }}>
        <ThemedText type="small" style={{ color: theme.primary, fontWeight: "700" }}>
          Replying to {replyTo.senderId === currentUserId ? "yourself" : otherUserName}
        </ThemedText>
        <ThemedText
          type="small"
          numberOfLines={1}
          style={{ color: theme.textSecondary, marginTop: 2 }}
        >
          {preview}
        </ThemedText>
      </View>
      <Pressable onPress={onClose} hitSlop={10}>
        <Feather name="x" size={20} color={theme.textSecondary} />
      </Pressable>
    </View>
  );
}
