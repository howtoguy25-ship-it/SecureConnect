import React, { forwardRef, useMemo } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ALERT_COLORS, ALERT_ICONS, ALERT_LABELS, type AlertDoc } from "@/types/alert";
import { colors, radius, shadow, spacing, pressedOpacity } from "@/theme/tokens";

interface Props {
  alert: AlertDoc | null;
  currentUid: string | null;
  onDelete: (alert: AlertDoc) => void;
  onHide: (alert: AlertDoc) => void;
  onConfirmStillHere: (alert: AlertDoc) => void;
}

function timeAgo(timestampMs: number): string {
  const diffMin = Math.max(0, Math.round((Date.now() - timestampMs) / 60000));
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const hours = Math.round(diffMin / 60);
  return `${hours} hr${hours === 1 ? "" : "s"} ago`;
}

export const AlertDetailSheet = forwardRef<BottomSheet, Props>(function AlertDetailSheet(
  { alert, currentUid, onDelete, onHide, onConfirmStillHere },
  ref
) {
  const snapPoints = useMemo(() => ["32%"], []);
  const isOwner = !!alert && !!currentUid && alert.createdBy === currentUid;

  return (
    <BottomSheet
      ref={ref}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      handleIndicatorStyle={styles.handleIndicator}
      backgroundStyle={styles.sheetBackground}
    >
      <BottomSheetView style={styles.container}>
        {alert && (
          <>
            <View style={styles.header}>
              <View style={[styles.iconWrap, { backgroundColor: ALERT_COLORS[alert.type] }]}>
                <MaterialCommunityIcons name={ALERT_ICONS[alert.type] as any} size={26} color="#FFFFFF" />
              </View>
              <View>
                <Text style={styles.title}>{ALERT_LABELS[alert.type]}</Text>
                <Text style={styles.subtitle}>
                  Reported {timeAgo(alert.createdAt)} · {alert.confirmCount} confirmed
                </Text>
              </View>
            </View>

            <Pressable
              style={({ pressed }) => [styles.confirmButton, pressed && { opacity: pressedOpacity }]}
              onPress={() => onConfirmStillHere(alert)}
            >
              <MaterialCommunityIcons name="check-circle-outline" size={18} color={colors.accent} />
              <Text style={styles.confirmText}>Still here</Text>
            </Pressable>

            {isOwner ? (
              <Pressable
                style={({ pressed }) => [styles.deleteButton, pressed && { opacity: pressedOpacity }]}
                onPress={() => onDelete(alert)}
              >
                <Text style={styles.deleteText}>Delete</Text>
              </Pressable>
            ) : (
              <Pressable
                style={({ pressed }) => [styles.hideButton, pressed && { opacity: pressedOpacity }]}
                onPress={() => onHide(alert)}
              >
                <Text style={styles.hideText}>Hide</Text>
              </Pressable>
            )}
          </>
        )}
      </BottomSheetView>
    </BottomSheet>
  );
});

const styles = StyleSheet.create({
  sheetBackground: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    ...shadow.high,
  },
  handleIndicator: {
    backgroundColor: colors.border,
    width: 40,
  },
  container: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    gap: spacing.md + 2,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.text,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  confirmButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
  },
  confirmText: {
    color: colors.accent,
    fontWeight: "600",
    fontSize: 14,
  },
  deleteButton: {
    backgroundColor: colors.danger,
    borderRadius: radius.md,
    paddingVertical: spacing.lg - 2,
    alignItems: "center",
  },
  deleteText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 15,
  },
  hideButton: {
    backgroundColor: "#F3F4F6",
    borderRadius: radius.md,
    paddingVertical: spacing.lg - 2,
    alignItems: "center",
  },
  hideText: {
    color: "#374151",
    fontWeight: "700",
    fontSize: 15,
  },
});
