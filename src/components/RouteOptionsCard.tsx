import React from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Route, RouteProfileKey } from "@/services/directions";
import { ROUTE_PROFILE_LABELS } from "@/services/directions";
import { colors, radius, shadow, spacing, pressedOpacity } from "@/theme/tokens";

const PROFILE_ICONS: Record<RouteProfileKey, keyof typeof Ionicons.glyphMap> = {
  normal: "navigate-outline",
  fastest: "flash-outline",
  safest: "shield-checkmark-outline",
};

const PROFILE_SUBTITLES: Record<RouteProfileKey, string> = {
  normal: "No rush, Google's own best route",
  fastest: "Backstreets, live traffic checked",
  safest: "Skips tolls, considers every road",
};

const PROFILE_ORDER: RouteProfileKey[] = ["normal", "fastest", "safest"];

interface Props {
  options: Record<RouteProfileKey, Route> | null;
  loading: boolean;
  selected: RouteProfileKey;
  onSelect: (key: RouteProfileKey) => void;
  onStart: () => void;
  onCancel: () => void;
  onAddStop: () => void;
  hasStop: boolean;
}

export function RouteOptionsCard({
  options,
  loading,
  selected,
  onSelect,
  onStart,
  onCancel,
  onAddStop,
  hasStop,
}: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.card, { bottom: insets.bottom + spacing.xl }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Choose a route</Text>
        <Pressable onPress={onCancel} hitSlop={12} accessibilityLabel="Cancel route selection">
          <Ionicons name="close" size={22} color={colors.textMuted} />
        </Pressable>
      </View>

      {loading || !options ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.loadingText}>Finding the best routes…</Text>
        </View>
      ) : (
        <>
          {PROFILE_ORDER.map((key) => {
            const route = options[key];
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
                  <Text style={styles.optionEta}>{usingTraffic ? route.etaInTrafficText : route.etaText}</Text>
                  <Text style={styles.optionDistance}>{route.distanceText}</Text>
                </View>
              </Pressable>
            );
          })}

          <Pressable
            onPress={onAddStop}
            style={({ pressed }) => [styles.addStopRow, pressed && { opacity: pressedOpacity }]}
          >
            <Ionicons name="add-circle-outline" size={18} color={colors.accent} />
            <Text style={styles.addStopText}>{hasStop ? "Change stop" : "Add a stop on the way"}</Text>
          </Pressable>

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
