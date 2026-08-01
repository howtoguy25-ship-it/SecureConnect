import React from "react";
import { Text } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ALERT_ICONS, type AlertType } from "@/types/alert";

// "Police" and "crash" read far better as real pictographs than any single vector glyph
// available -- there's no "police car" (a car with lights, not just a badge/shield) glyph in
// MaterialCommunityIcons, MaterialIcons, or FontAwesome 5/6 (checked all four bundled sets),
// and no "car with a crash in front of it" glyph either. The web app already solved "police"
// with the real 🚓 pictograph; mirrored here, plus a car+impact pairing for crash that actually
// shows a car (the vector "car-brake-alert" glyph it replaces doesn't read as a crash at all).
const ALERT_EMOJI_OVERRIDE: Partial<Record<AlertType, string>> = {
  police: "🚓",
  crash: "🚗💥",
};

interface Props {
  type: AlertType;
  size: number;
  color: string;
}

export function AlertTypeGlyph({ type, size, color }: Props) {
  const emoji = ALERT_EMOJI_OVERRIDE[type];
  if (emoji) {
    return <Text style={{ fontSize: size, lineHeight: size * 1.15 }}>{emoji}</Text>;
  }
  return <MaterialCommunityIcons name={ALERT_ICONS[type] as any} size={size} color={color} />;
}
