import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { Spacing } from "@/constants/theme";

interface PinnedMessage {
  id: string;
  content: string | null;
  mediaType?: string | null;
}

interface PinnedMessageBannerProps {
  pinnedMessageId: string | null;
  messages: PinnedMessage[];
  decryptedCache: Record<string, string | null>;
  tryDecrypt: (content: string | null, msgId?: string) => string | null;
  theme: any;
  onPress: (msgId: string) => void;
}

export function PinnedMessageBanner({
  pinnedMessageId,
  messages,
  decryptedCache,
  tryDecrypt,
  theme,
  onPress,
}: PinnedMessageBannerProps) {
  if (!pinnedMessageId) return null;
  const pinned = messages.find((m) => m.id === pinnedMessageId);
  if (!pinned) return null;
  const preview =
    decryptedCache[pinned.id] ??
    tryDecrypt(pinned.content, pinned.id) ??
    (pinned.mediaType ? `[${pinned.mediaType}]` : "Pinned");
  return (
    <Pressable
      onPress={() => onPress(pinned.id)}
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        backgroundColor: theme.backgroundSecondary,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: theme.border,
        gap: Spacing.sm,
      }}
    >
      <Feather name="bookmark" size={16} color="#FFCC00" />
      <View style={{ flex: 1 }}>
        <ThemedText type="small" style={{ color: theme.primary, fontWeight: "700" }}>
          Pinned message
        </ThemedText>
        <ThemedText type="small" numberOfLines={1} style={{ color: theme.textSecondary }}>
          {preview}
        </ThemedText>
      </View>
    </Pressable>
  );
}
