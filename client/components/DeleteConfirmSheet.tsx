import React from "react";
import { Modal, Pressable, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";

interface DeleteCandidate {
  senderId: string;
  createdAt: string | Date;
}

interface DeleteConfirmSheetProps {
  visible: boolean;
  message: DeleteCandidate | null;
  currentUserId: string | undefined;
  theme: any;
  styles: any;
  onClose: () => void;
  onDeleteForMe: () => void;
  onDeleteForEveryone: () => void;
}

export function DeleteConfirmSheet({
  visible,
  message,
  currentUserId,
  theme,
  styles,
  onClose,
  onDeleteForMe,
  onDeleteForEveryone,
}: DeleteConfirmSheetProps) {
  const canDeleteForEveryone = message?.senderId === currentUserId;
  const ageMs = message ? Date.now() - new Date(message.createdAt).getTime() : 0;
  const within1h = ageMs <= 60 * 60 * 1000;
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
          <ThemedText type="h3" style={styles.messageOptionsTitle}>Delete Message</ThemedText>
          <Pressable
            style={[styles.messageOption, { backgroundColor: theme.backgroundDefault }]}
            onPress={() => { onClose(); onDeleteForMe(); }}
          >
            <View style={[styles.messageOptionIcon, { backgroundColor: '#8E8E93' }]}>
              <Feather name="trash-2" size={20} color="#fff" />
            </View>
            <View style={styles.messageOptionText}>
              <ThemedText type="body" style={{ fontWeight: "600" }}>Delete for me</ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                Remove only from this device
              </ThemedText>
            </View>
          </Pressable>
          {canDeleteForEveryone ? (
            <Pressable
              style={[styles.messageOption, { backgroundColor: theme.backgroundDefault, opacity: within1h ? 1 : 0.5 }]}
              onPress={within1h ? onDeleteForEveryone : undefined}
              disabled={!within1h}
            >
              <View style={[styles.messageOptionIcon, { backgroundColor: '#FF3B30' }]}>
                <Feather name="alert-octagon" size={20} color="#fff" />
              </View>
              <View style={styles.messageOptionText}>
                <ThemedText type="body" style={{ fontWeight: "600", color: '#FF3B30' }}>Delete for everyone</ThemedText>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  {within1h ? "Remove for both sides (within 1 hour)" : "Window expired (1 hour)"}
                </ThemedText>
              </View>
            </Pressable>
          ) : null}
          <Pressable
            style={[styles.messageOption, { backgroundColor: theme.backgroundDefault }]}
            onPress={onClose}
          >
            <View style={[styles.messageOptionIcon, { backgroundColor: theme.textSecondary }]}>
              <Feather name="x" size={20} color="#fff" />
            </View>
            <View style={styles.messageOptionText}>
              <ThemedText type="body" style={{ fontWeight: "600" }}>Cancel</ThemedText>
            </View>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}
