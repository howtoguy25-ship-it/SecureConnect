import React from "react";
import { Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSettings } from "@/context/SettingsContext";

export function MuteButton() {
  const { voiceEnabled, toggleVoiceEnabled } = useSettings();

  return (
    <Pressable
      onPress={toggleVoiceEnabled}
      style={styles.button}
      accessibilityRole="button"
      accessibilityLabel={voiceEnabled ? "Mute voice guidance" : "Unmute voice guidance"}
    >
      <Ionicons name={voiceEnabled ? "volume-high" : "volume-mute"} size={22} color="#0B1220" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
});
