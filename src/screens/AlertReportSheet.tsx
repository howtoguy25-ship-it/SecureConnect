import React, { forwardRef, useCallback, useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ALERT_COLORS, ALERT_ICONS, ALERT_LABELS, type AlertType } from "@/types/alert";

const ALERT_TYPES: AlertType[] = ["police", "emergency_vehicle", "hazard", "camera", "crash"];

interface Props {
  onShare: (type: AlertType) => void;
}

export const AlertReportSheet = forwardRef<BottomSheet, Props>(function AlertReportSheet(
  { onShare },
  ref
) {
  const [selected, setSelected] = useState<AlertType | null>(null);
  const snapPoints = useMemo(() => ["42%"], []);

  const handleConfirm = useCallback(() => {
    if (!selected) return;
    onShare(selected);
    setSelected(null);
  }, [selected, onShare]);

  return (
    <BottomSheet ref={ref} index={-1} snapPoints={snapPoints} enablePanDownToClose>
      <BottomSheetView style={styles.container}>
        <Text style={styles.title}>Report what you see</Text>
        <View style={styles.grid}>
          {ALERT_TYPES.map((type) => {
            const isSelected = selected === type;
            return (
              <Pressable
                key={type}
                onPress={() => setSelected(type)}
                style={[
                  styles.typeButton,
                  { borderColor: isSelected ? ALERT_COLORS[type] : "#E5E7EB" },
                  isSelected && { backgroundColor: `${ALERT_COLORS[type]}1A` },
                ]}
              >
                <MaterialCommunityIcons
                  name={ALERT_ICONS[type] as any}
                  size={30}
                  color={ALERT_COLORS[type]}
                />
                <Text style={styles.typeLabel}>{ALERT_LABELS[type]}</Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable
          disabled={!selected}
          onPress={handleConfirm}
          style={[styles.confirmButton, !selected && styles.confirmButtonDisabled]}
        >
          <Text style={styles.confirmText}>Share with nearby drivers</Text>
        </Pressable>
      </BottomSheetView>
    </BottomSheet>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 16,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  typeButton: {
    width: "30%",
    aspectRatio: 1,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  typeLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#374151",
    textAlign: "center",
  },
  confirmButton: {
    marginTop: 20,
    backgroundColor: "#2563EB",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  confirmButtonDisabled: {
    backgroundColor: "#93A3B8",
  },
  confirmText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 15,
  },
});
