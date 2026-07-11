import React, { forwardRef, useMemo } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ALERT_COLORS, ALERT_ICONS, ALERT_LABELS, type AlertDoc } from "@/types/alert";

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
    <BottomSheet ref={ref} index={-1} snapPoints={snapPoints} enablePanDownToClose>
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

            <Pressable style={styles.confirmButton} onPress={() => onConfirmStillHere(alert)}>
              <MaterialCommunityIcons name="check-circle-outline" size={18} color="#2563EB" />
              <Text style={styles.confirmText}>Still here</Text>
            </Pressable>

            {isOwner ? (
              <Pressable style={styles.deleteButton} onPress={() => onDelete(alert)}>
                <Text style={styles.deleteText}>Delete</Text>
              </Pressable>
            ) : (
              <Pressable style={styles.hideButton} onPress={() => onHide(alert)}>
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
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
    gap: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
  },
  subtitle: {
    fontSize: 13,
    color: "#6B7280",
    marginTop: 2,
  },
  confirmButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#2563EB",
    borderRadius: 12,
    paddingVertical: 12,
  },
  confirmText: {
    color: "#2563EB",
    fontWeight: "600",
    fontSize: 14,
  },
  deleteButton: {
    backgroundColor: "#DC2626",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  deleteText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 15,
  },
  hideButton: {
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  hideText: {
    color: "#374151",
    fontWeight: "700",
    fontSize: 15,
  },
});
