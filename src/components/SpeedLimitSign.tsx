import React from "react";
import { View, Text, StyleSheet } from "react-native";

interface Props {
  kmh: number;
}

/** A real, static road-sign readout -- not text overlaid on the map, a standalone badge
 *  matching the real-world speed-limit sign convention (white circle, thick red ring, bold
 *  black number, no extra label text -- the same shape every real speed limit sign on the
 *  actual road uses). Fixed colors regardless of the app's own map theme -- a real sign
 *  doesn't recolor itself either. */
export function SpeedLimitSign({ kmh }: Props) {
  return (
    <View style={styles.sign} accessibilityLabel={`Speed limit ${kmh} kilometers per hour`}>
      <Text style={styles.value}>{kmh}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sign: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#FFFFFF",
    borderWidth: 6,
    borderColor: "#DC2626",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 6,
  },
  value: {
    fontSize: 24,
    fontWeight: "900",
    lineHeight: 26,
    color: "#000000",
  },
});

