import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { RouteStep } from "@/services/directions";

const MANEUVER_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
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
  distanceRemainingText: string;
  onExit: () => void;
}

export function NavigationInstructionCard({ step, etaText, distanceRemainingText, onExit }: Props) {
  if (!step) return null;
  const icon = (step.maneuver && MANEUVER_ICONS[step.maneuver]) || "arrow-up";

  return (
    <View style={styles.card}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={28} color="#FFFFFF" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.instruction} numberOfLines={2}>
          {step.instruction}
        </Text>
        <Text style={styles.meta}>
          {(step.distanceMeters / 1000).toFixed(1)} km · ETA {etaText} · {distanceRemainingText} left
        </Text>
      </View>
      <Pressable onPress={onExit} hitSlop={12} style={styles.exitButton}>
        <Ionicons name="close" size={20} color="#111827" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: "absolute",
    top: 56,
    left: 12,
    right: 12,
    backgroundColor: "#111827",
    borderRadius: 16,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
  },
  instruction: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
  meta: {
    color: "#9CA3AF",
    fontSize: 12,
    marginTop: 4,
  },
  exitButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
});
