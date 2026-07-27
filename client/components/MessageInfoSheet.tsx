import React from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { Spacing } from "@/constants/theme";

interface InfoMessage {
  createdAt: string | Date;
  deliveredAt?: string | Date | null;
  readAt?: string | Date | null;
  expiresAt?: string | Date | null;
}

interface MessageInfoSheetProps {
  visible: boolean;
  message: InfoMessage | null;
  theme: any;
  styles: any;
  onClose: () => void;
}

export function MessageInfoSheet({
  visible,
  message,
  theme,
  styles,
  onClose,
}: MessageInfoSheetProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <View style={[styles.messageOptionsContainer, { backgroundColor: theme.backgroundRoot }]}>
          <View style={styles.messageOptionsHandle}>
            <View style={[styles.handleBar, { backgroundColor: theme.border }]} />
          </View>
          <ThemedText type="h3" style={styles.messageOptionsTitle}>
            Message Info
          </ThemedText>
          {message ? (
            <View style={{ paddingHorizontal: Spacing.md, gap: Spacing.md }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <ThemedText type="body" style={{ color: theme.textSecondary }}>Sent</ThemedText>
                <ThemedText type="body">{new Date(message.createdAt).toLocaleString()}</ThemedText>
              </View>
              {message.deliveredAt ? (
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <ThemedText type="body" style={{ color: theme.textSecondary }}>Delivered</ThemedText>
                  <ThemedText type="body">{new Date(message.deliveredAt).toLocaleString()}</ThemedText>
                </View>
              ) : null}
              {message.readAt ? (
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <ThemedText type="body" style={{ color: theme.textSecondary }}>Read</ThemedText>
                  <ThemedText type="body">{new Date(message.readAt).toLocaleString()}</ThemedText>
                </View>
              ) : null}
              {message.expiresAt ? (
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <ThemedText type="body" style={{ color: theme.textSecondary }}>Expires</ThemedText>
                  <ThemedText type="body">{new Date(message.expiresAt).toLocaleString()}</ThemedText>
                </View>
              ) : null}
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <ThemedText type="body" style={{ color: theme.textSecondary }}>Encryption</ThemedText>
                <ThemedText type="body">End-to-end (Pryvo)</ThemedText>
              </View>
            </View>
          ) : null}
          <Pressable
            style={[styles.messageOption, { backgroundColor: theme.backgroundDefault, marginTop: Spacing.lg }]}
            onPress={onClose}
          >
            <View style={[styles.messageOptionIcon, { backgroundColor: theme.textSecondary }]}>
              <Feather name="x" size={20} color="#fff" />
            </View>
            <View style={styles.messageOptionText}>
              <ThemedText type="body" style={{ fontWeight: "600" }}>Close</ThemedText>
            </View>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}
