import React from "react";
import { Modal, Pressable, View, StyleSheet, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { Spacing, BorderRadius } from "@/constants/theme";

interface DeleteCandidate {
  senderId: string;
  createdAt: string | Date;
}

interface DeleteConfirmSheetProps {
  visible: boolean;
  message: DeleteCandidate | null;
  currentUserId: string | undefined;
  theme: any;
  // Kept for backward compatibility with existing call sites — this
  // component no longer depends on the parent's shared StyleSheet (that
  // coupling made it impossible to restyle without risking every other
  // sheet built on the same style keys), so this prop is now unused.
  styles?: any;
  onClose: () => void;
  onDeleteForMe: () => void;
  onDeleteForEveryone: () => void;
}

export function DeleteConfirmSheet({
  visible,
  message,
  currentUserId,
  theme,
  onClose,
  onDeleteForMe,
  onDeleteForEveryone,
}: DeleteConfirmSheetProps) {
  const insets = useSafeAreaInsets();
  const canDeleteForEveryone = message?.senderId === currentUserId;
  const ageMs = message ? Date.now() - new Date(message.createdAt).getTime() : 0;
  const within1h = ageMs <= 60 * 60 * 1000;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={sheetStyles.overlay} onPress={onClose}>
        <Pressable
          style={[sheetStyles.wrap, { paddingBottom: insets.bottom + Spacing.md }]}
          // Swallow taps inside the sheet so they don't fall through to the
          // overlay's dismiss handler.
          onPress={() => {}}
        >
          <View style={sheetStyles.handle} />

          <View style={[sheetStyles.group, { backgroundColor: theme.backgroundDefault }]}>
            <ThemedText type="small" style={[sheetStyles.groupTitle, { color: theme.textSecondary }]}>
              DELETE MESSAGE
            </ThemedText>

            <Row
              icon="trash-2"
              iconColor={theme.text}
              iconBg={theme.textSecondary + "1a"}
              title="Delete for me"
              subtitle="Remove only from this device"
              theme={theme}
              onPress={() => { onClose(); onDeleteForMe(); }}
            />

            {canDeleteForEveryone ? (
              <>
                <View style={[sheetStyles.divider, { backgroundColor: theme.border }]} />
                <Row
                  icon="alert-octagon"
                  iconColor="#FF3B30"
                  iconBg="#FF3B301a"
                  title="Delete for everyone"
                  titleColor="#FF3B30"
                  subtitle={within1h ? "Remove for both sides" : "Window expired — over 1 hour old"}
                  theme={theme}
                  disabled={!within1h}
                  onPress={within1h ? () => { onClose(); onDeleteForEveryone(); } : undefined}
                />
              </>
            ) : null}
          </View>

          <Pressable
            style={({ pressed }) => [
              sheetStyles.cancelBtn,
              { backgroundColor: theme.backgroundDefault, opacity: pressed ? 0.7 : 1 },
            ]}
            onPress={onClose}
          >
            <ThemedText type="body" style={{ fontWeight: "600", color: theme.primary }}>
              Cancel
            </ThemedText>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Row({
  icon,
  iconColor,
  iconBg,
  title,
  titleColor,
  subtitle,
  theme,
  disabled,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  iconColor: string;
  iconBg: string;
  title: string;
  titleColor?: string;
  subtitle: string;
  theme: any;
  disabled?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        sheetStyles.row,
        { opacity: disabled ? 0.45 : pressed ? 0.6 : 1 },
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <View style={[sheetStyles.rowIcon, { backgroundColor: iconBg }]}>
        <Feather name={icon} size={18} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <ThemedText type="body" style={{ fontWeight: "600", color: titleColor ?? theme.text }}>
          {title}
        </ThemedText>
        <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: 1 }}>
          {subtitle}
        </ThemedText>
      </View>
    </Pressable>
  );
}

const sheetStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  wrap: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    gap: Spacing.sm,
  },
  handle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.35)",
    marginBottom: Spacing.xs,
  },
  group: {
    borderRadius: BorderRadius.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.15,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
      },
      android: { elevation: 6 },
    }),
  },
  groupTitle: {
    fontWeight: "700",
    letterSpacing: 0.5,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: Spacing.lg + 36 + Spacing.md,
  },
  cancelBtn: {
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
});
