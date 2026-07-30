import React from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, type LayoutChangeEvent } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Route, RouteProfileKey, TravelMode } from "@/services/directions";
import { ROUTE_PROFILE_LABELS, TRAVEL_MODE_LABELS } from "@/services/directions";
import { colors, radius, shadow, spacing, pressedOpacity } from "@/theme/tokens";

const PROFILE_ICONS: Record<RouteProfileKey, keyof typeof Ionicons.glyphMap> = {
  normal: "navigate-outline",
  fastest: "flash-outline",
  safest: "shield-checkmark-outline",
};

const PROFILE_SUBTITLES: Record<RouteProfileKey, string> = {
  normal: "No rush, Google's own best route",
  fastest: "Quickest right now, live traffic checked",
  safest: "Skips tolls, considers every road",
};

const PROFILE_ORDER: RouteProfileKey[] = ["normal", "fastest", "safest"];

const TRAVEL_MODE_ORDER: TravelMode[] = ["driving", "walking", "bicycling", "transit"];

const TRAVEL_MODE_ICONS: Record<TravelMode, keyof typeof Ionicons.glyphMap> = {
  driving: "car-outline",
  walking: "walk-outline",
  bicycling: "bicycle-outline",
  transit: "bus-outline",
};

interface Props {
  options: Record<RouteProfileKey, Route> | null;
  // Real single-route result for walking/bicycling/transit -- see MapScreen's fetchRouteOptions.
  modeRoute: Route | null;
  travelMode: TravelMode;
  onSelectTravelMode: (mode: TravelMode) => void;
  loading: boolean;
  errorText?: string | null;
  selected: RouteProfileKey;
  onSelect: (key: RouteProfileKey) => void;
  onStart: () => void;
  onCancel: () => void;
  onAddStop: () => void;
  hasStop: boolean;
  // Real measured card height, so the caller can fit the previewed route's polyline above it
  // instead of guessing a fixed bottom padding that this card -- 3 route options, a mode row,
  // and Add stop/Start -- reliably grows taller than.
  onHeightChange?: (height: number) => void;
}

export function RouteOptionsCard({
  options,
  modeRoute,
  travelMode,
  onSelectTravelMode,
  loading,
  errorText,
  selected,
  onSelect,
  onStart,
  onCancel,
  onAddStop,
  hasStop,
  onHeightChange,
}: Props) {
  const insets = useSafeAreaInsets();
  const isDriving = travelMode === "driving";
  const hasResult = isDriving ? !!options : !!modeRoute;

  const onLayout = (e: LayoutChangeEvent) => {
    onHeightChange?.(e.nativeEvent.layout.height);
  };

  return (
    <View style={[styles.card, { bottom: insets.bottom + spacing.xl }]} onLayout={onLayout}>
      <View style={styles.header}>
        <Text style={styles.title}>Choose a route</Text>
        <Pressable onPress={onCancel} hitSlop={12} accessibilityLabel="Cancel route selection">
          <Ionicons name="close" size={22} color={colors.textMuted} />
        </Pressable>
      </View>

      {/* Real, independently-fetched Google Directions results per mode -- see
          MapScreen's fetchRouteOptions/getDirectionsForMode -- not driving-time estimates
          scaled by a guessed walking/cycling speed. */}
      <View style={styles.modeRow}>
        {TRAVEL_MODE_ORDER.map((mode) => {
          const isActive = mode === travelMode;
          return (
            <Pressable
              key={mode}
              onPress={() => onSelectTravelMode(mode)}
              style={({ pressed }) => [
                styles.modeButton,
                isActive && styles.modeButtonActive,
                pressed && { opacity: pressedOpacity },
              ]}
              accessibilityLabel={`${TRAVEL_MODE_LABELS[mode]} directions`}
            >
              <Ionicons name={TRAVEL_MODE_ICONS[mode]} size={18} color={isActive ? "#FFFFFF" : colors.textMuted} />
              <Text style={[styles.modeButtonText, isActive && styles.modeButtonTextActive]}>
                {TRAVEL_MODE_LABELS[mode]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {errorText ? (
        <View style={styles.loadingRow}>
          <Ionicons name="alert-circle" size={20} color={colors.danger} />
          <Text style={styles.errorText}>{errorText}</Text>
        </View>
      ) : loading || !hasResult ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.loadingText}>
            {isDriving ? "Finding the best routes…" : `Finding a ${TRAVEL_MODE_LABELS[travelMode].toLowerCase()} route…`}
          </Text>
        </View>
      ) : (
        <>
          {isDriving
            ? PROFILE_ORDER.map((key) => {
                const route = options![key];
                const isSelected = key === selected;
                const usingTraffic = route.etaInTrafficText != null;
                return (
                  <Pressable
                    key={key}
                    onPress={() => onSelect(key)}
                    style={({ pressed }) => [
                      styles.option,
                      isSelected && styles.optionSelected,
                      pressed && { opacity: pressedOpacity },
                    ]}
                  >
                    <View style={[styles.iconWrap, isSelected && styles.iconWrapSelected]}>
                      <Ionicons
                        name={PROFILE_ICONS[key]}
                        size={20}
                        color={isSelected ? "#FFFFFF" : colors.textMuted}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.optionTitleRow}>
                        <Text style={styles.optionTitle}>{ROUTE_PROFILE_LABELS[key]}</Text>
                        {route.hasTrafficDelay && (
                          <View style={styles.trafficBadge}>
                            <Text style={styles.trafficBadgeText}>Traffic</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.optionSubtitle}>{PROFILE_SUBTITLES[key]}</Text>
                    </View>
                    <View style={styles.optionStats}>
                      <Text style={styles.optionEta}>
                        {usingTraffic ? route.etaInTrafficText : route.etaText}
                      </Text>
                      <Text style={styles.optionDistance}>{route.distanceText}</Text>
                    </View>
                  </Pressable>
                );
              })
            : modeRoute && (
                // A single mode has exactly one meaningful route in the overwhelming majority
                // of cases (transit especially -- it's governed by real timetables, not
                // alternative road choices), so this is a summary row instead of a 3-way picker.
                <View style={[styles.option, styles.optionSelected]}>
                  <View style={[styles.iconWrap, styles.iconWrapSelected]}>
                    <Ionicons name={TRAVEL_MODE_ICONS[travelMode]} size={20} color="#FFFFFF" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.optionTitle}>{TRAVEL_MODE_LABELS[travelMode]}</Text>
                    <Text style={styles.optionSubtitle}>Real-time Google Directions estimate</Text>
                  </View>
                  <View style={styles.optionStats}>
                    <Text style={styles.optionEta}>{modeRoute.etaText}</Text>
                    <Text style={styles.optionDistance}>{modeRoute.distanceText}</Text>
                  </View>
                </View>
              )}

          {/* Transit doesn't support an arbitrary mid-trip waypoint the way a driving/walking/
              cycling route does (Google's Directions API has no real notion of "stop by here"
              on a fixed-timetable transit trip) -- hidden rather than shown and silently
              failing/ignored. */}
          {travelMode !== "transit" && (
            <Pressable
              onPress={onAddStop}
              style={({ pressed }) => [styles.addStopRow, pressed && { opacity: pressedOpacity }]}
            >
              <Ionicons name="add-circle-outline" size={18} color={colors.accent} />
              <Text style={styles.addStopText}>{hasStop ? "Change stop" : "Add a stop on the way"}</Text>
            </Pressable>
          )}

          <Pressable
            onPress={onStart}
            style={({ pressed }) => [styles.startButton, pressed && { opacity: pressedOpacity }]}
          >
            <Text style={styles.startButtonText}>Start</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadow.high,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
    color: colors.text,
  },
  modeRow: {
    flexDirection: "row",
    gap: spacing.xs + 2,
    marginBottom: spacing.xs,
  },
  modeButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  modeButtonActive: {
    backgroundColor: colors.accent,
  },
  modeButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
  },
  modeButtonTextActive: {
    color: "#FFFFFF",
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  loadingText: {
    color: colors.textMuted,
    fontSize: 14,
  },
  errorText: {
    flex: 1,
    color: colors.danger,
    fontSize: 14,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    padding: spacing.md,
  },
  optionSelected: {
    borderColor: colors.accent,
    backgroundColor: "#EFF6FF",
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrapSelected: {
    backgroundColor: colors.accent,
  },
  optionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
  },
  optionSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  trafficBadge: {
    backgroundColor: "#FEF3C7",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
  },
  trafficBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#92400E",
  },
  optionStats: {
    alignItems: "flex-end",
  },
  optionEta: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  optionDistance: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  addStopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  addStopText: {
    color: colors.accent,
    fontWeight: "600",
    fontSize: 13,
  },
  startButton: {
    marginTop: spacing.xs,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.lg - 2,
    alignItems: "center",
  },
  startButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 15,
  },
});
