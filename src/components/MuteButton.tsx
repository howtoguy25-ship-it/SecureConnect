import React from "react";
import { Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSettings } from "@/context/SettingsContext";
import { colors, radius, shadow, pressedOpacity } from "@/theme/tokens";

export function MuteButton() {
  const { voiceEnabled, toggleVoiceEnabled } = useSettings();

  return (
    <Pressable
      onPress={toggleVoiceEnabled}
      style={({ pressed }) => [styles.button, pressed && { opacity: pressedOpacity }]}
      accessibilityRole="button"
      accessibilityLabel={voiceEnabled ? "Mute voice guidance" : "Unmute voice guidance"}
    >
      <Ionicons name={voiceEnabled ? "volume-high" : "volume-mute"} size={22} color={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.low,
  },
});
