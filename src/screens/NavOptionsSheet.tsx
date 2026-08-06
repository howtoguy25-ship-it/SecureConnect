import React, { forwardRef } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing, pressedOpacity } from "@/theme/tokens";

interface Props {
  onReportAlert: () => void;
  onShareEta: () => void;
  onOpenDetection: () => void;
  onEndNavigation: () => void;
  onClose: () => void;
  onSheetChange?: (index: number) => void;
}

// The "..." button on the new bottom trip bar (see NavBottomBar.tsx) -- everything that used
// to live in the nav card's own actions row (Report/Share ETA/AI Detection) plus a dedicated
// End Navigation entry now lives here instead, matching the explicit ask for a compact bottom
// tab (ETA/road/Add Stop/options) rather than a wide row of icons competing with the turn
// instructions for space.
export const NavOptionsSheet = forwardRef<BottomSheet, Props>(function NavOptionsSheet(
  { onReportAlert, onShareEta, onOpenDetection, onEndNavigation, onClose, onSheetChange },
  ref
) {
  const insets = useSafeAreaInsets();

  return (
    <BottomSheet
      ref={ref}
      index={-1}
      snapPoints={SNAP_POINTS}
      enablePanDownToClose
      onChange={onSheetChange}
      handleIndicatorStyle={styles.handleIndicator}
      backgroundStyle={styles.sheetBackground}
    >
      <BottomSheetView style={[styles.container, { paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Trip options</Text>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            style={({ pressed }) => [styles.closeButton, pressed && { opacity: pressedOpacity }]}
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={20} color={colors.textMuted} />
          </Pressable>
        </View>

        <OptionRow icon="warning" iconBg="#F59E0B" iconColor="#111827" label="Report an incident" onPress={onReportAlert} />
        <OptionRow icon="share-outline" iconBg={colors.surfaceMuted} iconColor={colors.text} label="Share ETA" onPress={onShareEta} />
        <OptionRow
          icon="videocam-outline"
          iconBg={colors.surfaceMuted}
          iconColor={colors.text}
          label="AI Vehicle Detection"
          onPress={onOpenDetection}
        />

        <View style={styles.divider} />

        <OptionRow icon="close-circle" iconBg="#FEE2E2" iconColor="#DC2626" label="End navigation" labelColor="#DC2626" onPress={onEndNavigation} />
      </BottomSheetView>
    </BottomSheet>
  );
});

const SNAP_POINTS = ["42%"];

function OptionRow({
  icon,
  iconBg,
  iconColor,
  label,
  labelColor,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  iconColor: string;
  label: string;
  labelColor?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: pressedOpacity }]}
      accessibilityLabel={label}
    >
      <View style={[styles.rowIconWrap, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={20} color={iconColor} />
      </View>
      <Text style={[styles.rowLabel, labelColor ? { color: labelColor } : null]}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheetBackground: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
  handleIndicator: {
    backgroundColor: colors.surfaceMuted,
    width: 40,
  },
  container: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
    color: colors.text,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  rowIconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
  },
  divider: {
    height: 1,
    backgroundColor: colors.surfaceMuted,
    marginVertical: spacing.sm,
  },
});
