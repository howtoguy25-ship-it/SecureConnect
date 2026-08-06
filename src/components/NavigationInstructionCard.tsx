import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, Animated, type LayoutChangeEvent } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { RouteStep } from "@/services/directions";
import { SpeedLimitSign } from "@/components/SpeedLimitSign";
import { NAV_CARD_THEMES, type NavCardThemeKey } from "@/utils/navCardTheme";
import { radius, spacing, shadow, pressedOpacity } from "@/theme/tokens";

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
  // The road the driver is ON right now (from the same OSM lookup the speed limit uses) --
  // distinct from `step.instruction`'s "turn onto X", which is the NEXT road. Null until a
  // real lookup resolves one (never a guess).
  roadName: string | null;
  speedLimitKmh: number | null;
  themeKey: NavCardThemeKey;
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
  roadName,
  speedLimitKmh,
  themeKey,
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
  const theme = NAV_CARD_THEMES[themeKey];

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

  // Real collapse toggle -- tapping the chevron drops this down to just the icon + a single
  // line of instruction text (plus the road/speed row below, still live), hiding the actions
  // row and End navigation button entirely, so a driver who wants to see more of the actual
  // route/map underneath can do that without losing turn guidance altogether. Defaults open
  // (matches the card's previous always-expanded behavior) -- this is an opt-in "give me more
  // screen" action, not a new default.
  const [collapsed, setCollapsed] = useState(false);

  // Real background-transparency toggle -- the small circle button in the header. Off (normal)
  // by default every time navigation starts; tapping it switches the card to a translucent
  // version of the same theme (see navCardTheme.ts's backgroundTransparent) so the live map
  // shows through behind it, and turns the button itself blue as a clear "this is now on"
  // indicator. Text stays the same theme color either way -- textShadowColor (also part of the
  // theme) is what actually keeps it readable over a transparent, uncontrolled background,
  // not the background opacity alone.
  const [transparent, setTransparent] = useState(false);

  if (!step) return null;
  const icon = (step.maneuver && MANEUVER_ICONS[step.maneuver]) || "arrow-up";

  const onLayout = (e: LayoutChangeEvent) => {
    onHeightChange?.(e.nativeEvent.layout.height);
  };

  const textShadow = {
    textShadowColor: theme.textShadowColor,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  };

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: transparent ? theme.backgroundTransparent : theme.background },
        collapsed && styles.cardCollapsed,
        { top: insets.top + spacing.md },
      ]}
      onLayout={onLayout}
    >
      <View style={styles.headerRow}>
        <Pressable
          style={({ pressed }) => [styles.tapArea, pressed && { opacity: pressedOpacity }]}
          onPress={collapsed ? () => setCollapsed(false) : onExpandDirections}
          accessibilityLabel={collapsed ? "Expand navigation card" : "Show full route directions"}
        >
          <Animated.View style={[styles.animatedContent, { transform: [{ translateY }], opacity }]}>
            <View style={[styles.iconWrap, collapsed && styles.iconWrapCollapsed, { backgroundColor: theme.iconWrapBg }]}>
              <Ionicons name={icon} size={collapsed ? 22 : 30} color={theme.iconColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.instruction, { color: theme.text }, textShadow]} numberOfLines={collapsed ? 1 : 2}>
                {step.instruction}
              </Text>
              {!collapsed && (
                <Text style={[styles.meta, { color: theme.textSecondary }, textShadow]}>
                  {(step.distanceMeters / 1000).toFixed(1)} km · ETA {etaText} (arrives {arrivalClockText}) ·{" "}
                  {distanceRemainingText} left
                </Text>
              )}
            </View>
          </Animated.View>
        </Pressable>
        {/* Small circle transparency toggle -- blue (accent) fill only while active, so its own
            color is the "this is on" signal, independent of the card's own selected theme. */}
        <Pressable
          onPress={() => setTransparent((v) => !v)}
          hitSlop={12}
          style={({ pressed }) => [
            styles.toggleButton,
            { backgroundColor: transparent ? "#2563EB" : theme.toggleBg },
            pressed && { opacity: pressedOpacity },
          ]}
          accessibilityLabel={transparent ? "Switch card to solid background" : "Switch card to transparent background"}
        >
          <Ionicons
            name={transparent ? "eye-outline" : "eye-off-outline"}
            size={16}
            color={transparent ? "#FFFFFF" : theme.toggleIcon}
          />
        </Pressable>
        <Pressable
          onPress={() => setCollapsed((v) => !v)}
          hitSlop={12}
          style={({ pressed }) => [styles.toggleButton, { backgroundColor: theme.toggleBg }, pressed && { opacity: pressedOpacity }]}
          accessibilityLabel={collapsed ? "Expand navigation card" : "Collapse navigation card"}
        >
          <Ionicons name={collapsed ? "chevron-down" : "chevron-up"} size={18} color={theme.toggleIcon} />
        </Pressable>
        <Pressable
          onPress={onExit}
          hitSlop={12}
          style={({ pressed }) => [styles.exitButton, { backgroundColor: theme.exitButtonBg }, pressed && { opacity: pressedOpacity }]}
          accessibilityLabel="Exit navigation"
        >
          <Ionicons name="close" size={20} color={theme.exitButtonIcon} />
        </Pressable>
      </View>

      {/* Current road (not the next turn's road -- that's step.instruction above) + real posted
          speed limit, both from the same OSM lookup (MapScreen's speedLimitKmh effect) -- a
          dedicated row of its own so neither ever overlaps the turn instruction or the actions
          below it. Only rendered once a real lookup has actually resolved something (never a
          placeholder/guess), and stays visible even collapsed since it's one compact row. */}
      {(roadName || speedLimitKmh !== null) && (
        <View style={styles.roadRow}>
          {speedLimitKmh !== null && (
            <View style={styles.roadRowSpeedSign}>
              <SpeedLimitSign kmh={speedLimitKmh} />
            </View>
          )}
          {roadName && (
            <Text style={[styles.roadName, { color: theme.text }, textShadow]} numberOfLines={1}>
              {roadName}
            </Text>
          )}
        </View>
      )}

      {!collapsed && (
        <>
          {/* Real actions -- same handlers MapScreen's own scattered add-stop/report/detection
              entry points already use, just surfaced together here too, matching the app's
              original nav card layout. Report gets its own hazard-triangle styling (filled
              orange badge) instead of the shared translucent background every other action
              uses, so it reads as the one safety-critical action in the row. */}
          <View style={styles.actionsRow}>
            <NavAction
              icon={hasStop ? "close-circle-outline" : "add-circle-outline"}
              label={hasStop ? "Remove Stop" : "Add Stop"}
              onPress={hasStop ? onRemoveStop : onAddStop}
              bg={theme.actionBg}
              color={theme.actionText}
            />
            <NavAction icon="share-outline" label="Share ETA" onPress={onShareEta} bg={theme.actionBg} color={theme.actionText} />
            <NavAction
              icon="warning"
              label="Report"
              onPress={onReportAlert}
              bg="#F59E0B"
              color="#111827"
            />
            <NavAction
              icon="videocam-outline"
              label="AI Detection"
              onPress={onOpenDetection}
              bg={theme.actionBg}
              color={theme.actionText}
            />
          </View>

          <Pressable
            onPress={onExit}
            style={({ pressed }) => [styles.endNavButton, pressed && { opacity: pressedOpacity }]}
            accessibilityLabel="End navigation"
          >
            <Text style={styles.endNavButtonText}>End navigation</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

function NavAction({
  icon,
  label,
  onPress,
  bg,
  color,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  bg: string;
  color: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.navAction, { backgroundColor: bg }, pressed && { opacity: pressedOpacity }]}
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={20} color={color} />
      <Text style={[styles.navActionLabel, { color }]} numberOfLines={1}>
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
    borderRadius: radius.xl,
    padding: spacing.lg - 4,
    gap: spacing.sm + 2,
    ...shadow.medium,
  },
  // Collapsed state shrinks padding further -- with the actions row/End navigation button
  // both gone (see the render call site), the card is just the header + road/speed row's own
  // height plus this trimmed padding, real screen space back for the map/route underneath.
  cardCollapsed: {
    padding: spacing.sm + 2,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  tapArea: {
    flex: 1,
  },
  animatedContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 2,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrapCollapsed: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  instruction: {
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  meta: {
    fontSize: 12,
    marginTop: 4,
  },
  // Current road + speed limit -- a distinct row below the header so it's never layered on top
  // of (or squeezed into) the turn instruction text. Speed sign sized down slightly from its
  // own default (64px) to stay proportional to a single text row.
  roadRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  roadRowSpeedSign: {
    transform: [{ scale: 0.6 }],
    marginVertical: -12,
    marginLeft: -6,
  },
  roadName: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  toggleButton: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  exitButton: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
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
  },
  navActionLabel: {
    fontSize: 10,
    fontWeight: "700",
  },
  endNavButton: {
    backgroundColor: "#DC2626",
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
