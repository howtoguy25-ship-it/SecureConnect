import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Pressable, Animated, type LayoutChangeEvent } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { RouteStep } from "@/services/directions";
import { colors, radius, shadow, spacing, pressedOpacity } from "@/theme/tokens";

export const MANEUVER_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  "turn-left": "arrow-back",
  "turn-right": "arrow-forward",
  "turn-slight-left": "arrow-back",
  "turn-slight-right": "arrow-forward",
  "turn-sharp-left": "arrow-back",
  "turn-sharp-right": "arrow-forward",
  "uturn-left": "return-up-back",
  "uturn-right": "return-up-forward",
  merge: "git-merge",
  "roundabout-left": "sync",
  "roundabout-right": "sync",
  "fork-left": "arrow-back",
  "fork-right": "arrow-forward",
  "ramp-left": "arrow-back",
  "ramp-right": "arrow-forward",
  straight: "arrow-up",
};

interface Props {
  step: RouteStep | null;
  etaText: string;
  arrivalClockText: string;
  distanceRemainingText: string;
  onExit: () => void;
  onShareEta: () => void;
  // Opens the full turn-by-turn directions list -- the whole icon+text area is tappable for
  // this (a bigger, easier target than a small dedicated button would be), while the actions
  // row/exit keep their own separate buttons so they're never accidentally triggered by the
  // same tap.
  onExpandDirections: () => void;
  // Real mid-trip add-a-stop -- same handlers MapScreen's own add-stop search bar and stop
  // state already use; this just gives them a second, more discoverable entry point matching
  // the old nav card layout, not new logic. hasStop toggles the label/icon to "Remove Stop"
  // once a mid-trip stop is actually active.
  onAddStop: () => void;
  onRemoveStop: () => void;
  hasStop: boolean;
  onReportAlert: () => void;
  onOpenDetection: () => void;
  // Reports the card's real rendered height (instruction text can wrap to 2 lines, meta text
  // can wrap too) so callers positioning other controls below it -- see MapScreen's
  // topRightControls -- can react to the actual height instead of guessing a fixed number.
  // A guessed constant meant the button column below could end up overlapping the bottom of a
  // taller (longer-instruction) card, which is exactly what made those buttons intermittently
  // miss taps depending on which instruction happened to be showing.
  onHeightChange?: (height: number) => void;
}

export function NavigationInstructionCard({
  step,
  etaText,
  arrivalClockText,
  distanceRemainingText,
  onExit,
  onShareEta,
  onExpandDirections,
  onAddStop,
  onRemoveStop,
  hasStop,
  onReportAlert,
  onOpenDetection,
  onHeightChange,
}: Props) {
  const insets = useSafeAreaInsets();

  // Slides the instruction content down (with a fade) into place every time the *active step*
  // actually changes -- i.e. "the driver just completed a turn and this is the next one" --
  // not on every GPS tick, which would re-trigger constantly since etaText/distanceRemainingText
  // update far more often than the step itself does. Tracked by the instruction text's own
  // identity rather than a separate index prop, since two different steps are never going to
  // share the exact same instruction text back to back.
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const prevInstructionRef = useRef<string | null>(null);

  useEffect(() => {
    if (!step) return;
    if (prevInstructionRef.current === null) {
      // First real instruction of this navigation session -- settles in place immediately,
      // nothing to animate from yet.
      prevInstructionRef.current = step.instruction;
      return;
    }
    if (prevInstructionRef.current === step.instruction) return;
    prevInstructionRef.current = step.instruction;
    translateY.setValue(-22);
    opacity.setValue(0);
    Animated.parallel([
      Animated.timing(translateY, { toValue: 0, duration: 380, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 380, useNativeDriver: true }),
    ]).start();
  }, [step, translateY, opacity]);

  if (!step) return null;
  const icon = (step.maneuver && MANEUVER_ICONS[step.maneuver]) || "arrow-up";

  const onLayout = (e: LayoutChangeEvent) => {
    onHeightChange?.(e.nativeEvent.layout.height);
  };

  return (
    <View style={[styles.card, { top: insets.top + spacing.md }]} onLayout={onLayout}>
      <View style={styles.headerRow}>
        <Pressable
          style={({ pressed }) => [styles.tapArea, pressed && { opacity: pressedOpacity }]}
          onPress={onExpandDirections}
          accessibilityLabel="Show full route directions"
        >
          <Animated.View style={[styles.animatedContent, { transform: [{ translateY }], opacity }]}>
            <View style={styles.iconWrap}>
              <Ionicons name={icon} size={30} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.instruction} numberOfLines={2}>
                {step.instruction}
              </Text>
              <Text style={styles.meta}>
                {(step.distanceMeters / 1000).toFixed(1)} km · ETA {etaText} (arrives {arrivalClockText}) ·{" "}
                {distanceRemainingText} left
              </Text>
            </View>
          </Animated.View>
        </Pressable>
        <Pressable
          onPress={onExit}
          hitSlop={12}
          style={({ pressed }) => [styles.exitButton, pressed && { opacity: pressedOpacity }]}
          accessibilityLabel="Exit navigation"
        >
          <Ionicons name="close" size={20} color={colors.text} />
        </Pressable>
      </View>

      {/* Real actions -- same handlers MapScreen's own scattered add-stop/report/detection
          entry points already use, just surfaced together here too, matching the app's
          original nav card layout. */}
      <View style={styles.actionsRow}>
        <NavAction
          icon={hasStop ? "close-circle-outline" : "add-circle-outline"}
          label={hasStop ? "Remove Stop" : "Add Stop"}
          onPress={hasStop ? onRemoveStop : onAddStop}
        />
        <NavAction icon="share-outline" label="Share ETA" onPress={onShareEta} />
        <NavAction icon="warning-outline" label="Report" onPress={onReportAlert} />
        <NavAction icon="videocam-outline" label="AI Detection" onPress={onOpenDetection} />
      </View>

      <Pressable
        onPress={onExit}
        style={({ pressed }) => [styles.endNavButton, pressed && { opacity: pressedOpacity }]}
        accessibilityLabel="End navigation"
      >
        <Text style={styles.endNavButtonText}>End navigation</Text>
      </Pressable>
    </View>
  );
}

function NavAction({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.navAction, pressed && { opacity: pressedOpacity }]}
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={20} color="#FFFFFF" />
      <Text style={styles.navActionLabel} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md,
    backgroundColor: colors.dark,
    borderRadius: radius.xl,
    padding: spacing.lg - 2,
    gap: spacing.md,
    ...shadow.medium,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  tapArea: {
    flex: 1,
  },
  animatedContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  instruction: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  meta: {
    color: colors.textFaint,
    fontSize: 12,
    marginTop: 4,
  },
  exitButton: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  actionsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  navAction: {
    flex: 1,
    alignItems: "center",
    gap: 4,
    paddingVertical: spacing.xs + 2,
    marginHorizontal: 2,
    borderRadius: radius.md,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  navActionLabel: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
  },
  endNavButton: {
    backgroundColor: colors.danger,
    borderRadius: radius.md,
    paddingVertical: spacing.md - 2,
    alignItems: "center",
  },
  endNavButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 15,
  },
});
