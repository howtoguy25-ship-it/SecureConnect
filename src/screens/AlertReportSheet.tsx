import React, { forwardRef, useCallback, useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ALERT_COLORS, ALERT_ICONS, ALERT_LABELS, type AlertType } from "@/types/alert";
import { colors, radius, shadow, spacing, pressedOpacity } from "@/theme/tokens";

const ALERT_TYPES: AlertType[] = [
  "police",
  "emergency_vehicle",
  "hazard",
  "camera",
  "crash",
  "traffic_light",
];

interface Props {
  onShare: (type: AlertType) => void;
}

export const AlertReportSheet = forwardRef<BottomSheet, Props>(function AlertReportSheet(
  { onShare },
  ref
) {
  const [selected, setSelected] = useState<AlertType | null>(null);
  const insets = useSafeAreaInsets();
  // A bit taller than the content strictly needs at rest, plus real bottom safe-area padding
  // below -- previously neither was accounted for, so the confirm button sat flush against
  // (and on notch-less-home-indicator iPhones, partly under) the bottom edge.
  const snapPoints = useMemo(() => ["48%"], []);

  const handleConfirm = useCallback(() => {
    if (!selected) return;
    onShare(selected);
    setSelected(null);
  }, [selected, onShare]);

  return (
    <BottomSheet
      ref={ref}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      handleIndicatorStyle={styles.handleIndicator}
      backgroundStyle={styles.sheetBackground}
    >
      <BottomSheetView style={[styles.container, { paddingBottom: insets.bottom + spacing.lg }]}>
        <Text style={styles.title}>Report what you see</Text>
        <View style={styles.grid}>
          {ALERT_TYPES.map((type) => {
            const isSelected = selected === type;
            return (
              <Pressable
                key={type}
                onPress={() => setSelected(type)}
                style={({ pressed }) => [
                  styles.typeButton,
                  { borderColor: isSelected ? ALERT_COLORS[type] : colors.border },
                  isSelected && { backgroundColor: `${ALERT_COLORS[type]}1A` },
                  pressed && { opacity: pressedOpacity },
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
          style={({ pressed }) => [
            styles.confirmButton,
            !selected && styles.confirmButtonDisabled,
            selected && pressed && { opacity: pressedOpacity },
          ]}
        >
          <Text style={styles.confirmText}>Share with nearby drivers</Text>
        </Pressable>
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
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.text,
    marginBottom: spacing.lg,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  typeButton: {
    width: "30%",
    aspectRatio: 1,
    borderRadius: radius.lg,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs + 2,
  },
  typeLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#374151",
    textAlign: "center",
  },
  confirmButton: {
    marginTop: spacing.xl,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.lg - 2,
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
