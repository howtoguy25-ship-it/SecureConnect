import React from "react";
import { View, StyleSheet, Modal, Pressable, Platform, Linking, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { Feather } from "@expo/vector-icons";

interface CallActionsSheetProps {
  visible: boolean;
  onClose: () => void;
  onSecureAudioCall: () => void;
  onSecureVideoCall: () => void;
  phoneNumber?: string;
  contactName: string;
}

export function CallActionsSheet({
  visible,
  onClose,
  onSecureAudioCall,
  onSecureVideoCall,
  phoneNumber,
  contactName,
}: CallActionsSheetProps) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

  const handleCarrierCall = async () => {
    if (!phoneNumber) {
      Alert.alert("No Phone Number", "This contact doesn't have a phone number available for carrier calls.");
      return;
    }

    if (Platform.OS === "web") {
      Alert.alert("Not Available", "Carrier calls are not available on web. Please use Pryvo Call instead.");
      return;
    }

    try {
      const telUrl = `tel:${phoneNumber}`;
      const canOpen = await Linking.canOpenURL(telUrl);
      
      if (canOpen) {
        onClose();
        await Linking.openURL(telUrl);
      } else {
        Alert.alert("Unable to Call", "Your device doesn't support making phone calls.");
      }
    } catch (error) {
      console.error("Failed to open dialer:", error);
      Alert.alert("Error", "Failed to open the phone dialer.");
    }
  };

  const handleSecureAudioCall = () => {
    onClose();
    onSecureAudioCall();
  };

  const handleSecureVideoCall = () => {
    onClose();
    onSecureVideoCall();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={[styles.sheet, { backgroundColor: theme.backgroundDefault, paddingBottom: insets.bottom + Spacing.lg }]}>
          <View style={styles.handle} />
          
          <ThemedText type="h4" style={[styles.title, { color: theme.text }]}>
            Call {contactName}
          </ThemedText>
          
          <ThemedText type="small" style={[styles.subtitle, { color: theme.textSecondary }]}>
            Choose how you want to call
          </ThemedText>

          <Pressable
            style={[styles.option, { backgroundColor: theme.primary + "15" }]}
            onPress={handleSecureAudioCall}
          >
            <View style={[styles.iconContainer, { backgroundColor: theme.primary }]}>
              <Feather name="phone" size={24} color="#fff" />
            </View>
            <View style={styles.optionContent}>
              <ThemedText type="body" style={[styles.optionTitle, { color: theme.text }]}>
                Pryvo Audio Call
              </ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                End-to-end encrypted in-app voice call
              </ThemedText>
            </View>
            <Feather name="chevron-right" size={20} color={theme.textSecondary} />
          </Pressable>

          <Pressable
            style={[styles.option, { backgroundColor: theme.primary + "15" }]}
            onPress={handleSecureVideoCall}
          >
            <View style={[styles.iconContainer, { backgroundColor: "#5856D6" }]}>
              <Feather name="video" size={24} color="#fff" />
            </View>
            <View style={styles.optionContent}>
              <ThemedText type="body" style={[styles.optionTitle, { color: theme.text }]}>
                Pryvo Video Call
              </ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                End-to-end encrypted in-app video call
              </ThemedText>
            </View>
            <Feather name="chevron-right" size={20} color={theme.textSecondary} />
          </Pressable>

          <Pressable
            style={[styles.option, { backgroundColor: theme.backgroundSecondary }]}
            onPress={handleCarrierCall}
          >
            <View style={[styles.iconContainer, { backgroundColor: "#34C759" }]}>
              <Feather name="phone-forwarded" size={24} color="#fff" />
            </View>
            <View style={styles.optionContent}>
              <ThemedText type="body" style={[styles.optionTitle, { color: theme.text }]}>
                Call via Phone Carrier
              </ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                {phoneNumber ? `Opens dialer with ${phoneNumber}` : "Regular phone call (if available)"}
              </ThemedText>
            </View>
            <Feather name="chevron-right" size={20} color={theme.textSecondary} />
          </Pressable>

          <Pressable
            style={[styles.cancelButton, { borderColor: theme.border }]}
            onPress={onClose}
          >
            <ThemedText type="body" style={{ color: theme.textSecondary }}>
              Cancel
            </ThemedText>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: "rgba(128,128,128,0.5)",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: Spacing.lg,
  },
  title: {
    textAlign: "center",
    marginBottom: Spacing.xs,
  },
  subtitle: {
    textAlign: "center",
    marginBottom: Spacing.xl,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  optionContent: {
    flex: 1,
  },
  optionTitle: {
    fontWeight: "600",
    marginBottom: 2,
  },
  cancelButton: {
    alignItems: "center",
    paddingVertical: Spacing.md,
    marginTop: Spacing.sm,
    borderTopWidth: 1,
  },
});
