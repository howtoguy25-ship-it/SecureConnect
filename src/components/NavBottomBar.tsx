import React from "react";
import { View, Text, StyleSheet, Pressable, type LayoutChangeEvent } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NAV_CARD_THEMES, type NavCardThemeKey } from "@/utils/navCardTheme";
import { radius, spacing, shadow, pressedOpacity } from "@/theme/tokens";

interface Props {
  etaText: string;
  arrivalClockText: string;
  distanceRemainingText: string;
  roadName: string | null;
  themeKey: NavCardThemeKey;
  hasStop: boolean;
  onAddStop: () => void;
  onRemoveStop: () => void;
  onOptions: () => void;
  // Same real-measured-height pattern NavigationInstructionCard already uses for the controls
  // above it -- MapScreen shifts the FAB column up by this bar's actual height so the two
  // never collide, instead of guessing a fixed number that only holds for one line count.
  onHeightChange?: (height: number) => void;
}

// Waze/Google-Maps-style persistent trip strip at the bottom of the screen: live ETA/arrival
// time/distance remaining plus the road currently being driven, a "+" to add a mid-trip stop,
// and a "..." for the less-frequent actions (Report/Share ETA/AI Detection/End -- see
// NavOptionsSheet). Everything that used to be a 4-icon actions row inside the top turn card
// now lives down here instead, matching the explicit ask to move ETA/road/time/distance to the
// bottom, "similar to Maps/Waze".
export function NavBottomBar({
  etaText,
  arrivalClockText,
  distanceRemainingText,
  roadName,
  themeKey,
  hasStop,
  onAddStop,
  onRemoveStop,
  onOptions,
  onHeightChange,
}: Props) {
  const insets = useSafeAreaInsets();
  const theme = NAV_CARD_THEMES[themeKey];

  const onLayout = (e: LayoutChangeEvent) => {
    onHeightChange?.(e.nativeEvent.layout.height);
  };

  return (
    <View
      style={[styles.bar, { backgroundColor: theme.background, bottom: insets.bottom + spacing.sm }]}
      onLayout={onLayout}
    >
      <View style={styles.info}>
        <Text style={[styles.infoPrimary, { color: theme.text }]} numberOfLines={1}>
          {etaText} · {arrivalClockText} · {distanceRemainingText}
        </Text>
        {roadName && (
          <Text style={[styles.infoSecondary, { color: theme.textSecondary }]} numberOfLines={1}>
            {roadName}
          </Text>
        )}
      </View>

      <Pressable
        onPress={hasStop ? onRemoveStop : onAddStop}
        hitSlop={8}
        style={({ pressed }) => [styles.iconButton, { backgroundColor: theme.actionBg }, pressed && { opacity: pressedOpacity }]}
        accessibilityLabel={hasStop ? "Remove stop" : "Add a stop"}
      >
        <Ionicons name={hasStop ? "close-circle-outline" : "add"} size={22} color={theme.actionText} />
      </Pressable>

      <Pressable
        onPress={onOptions}
        hitSlop={8}
        style={({ pressed }) => [styles.iconButton, { backgroundColor: theme.actionBg }, pressed && { opacity: pressedOpacity }]}
        accessibilityLabel="More options"
      >
        <Ionicons name="ellipsis-vertical" size={20} color={theme.actionText} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md,
    borderRadius: radius.xl,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    ...shadow.medium,
  },
  info: {
    flex: 1,
  },
  infoPrimary: {
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  infoSecondary: {
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
});
