import React from "react";
import { View, Text, StyleSheet } from "react-native";

interface Props {
  kmh: number;
}

/** A real, static road-sign readout -- not text overlaid on the map, a standalone badge
 *  matching how a physical speed-limit sign (or Apple/Google Maps' own speed-limit badge)
 *  presents the number. Fixed white/black colors regardless of the app's own map theme, same
 *  as the web app's equivalent (web/src/components/SpeedLimitSign.tsx) -- a real sign doesn't
 *  recolor itself either. */
export function SpeedLimitSign({ kmh }: Props) {
  return (
    <View style={styles.sign} accessibilityLabel={`Speed limit ${kmh} kilometers per hour`}>
      <Text style={styles.label}>LIMIT</Text>
      <Text style={styles.value}>{kmh}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sign: {
    width: 64,
    height: 64,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 4,
    borderColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 6,
  },
  label: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.5,
    color: "#111827",
  },
  value: {
    fontSize: 22,
    fontWeight: "800",
    lineHeight: 24,
    marginTop: 2,
    color: "#111827",
  },
});
