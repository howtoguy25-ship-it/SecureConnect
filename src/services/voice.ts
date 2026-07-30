import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Speech from "expo-speech";

const VOICE_ENABLED_KEY = "@trackline/voiceEnabled";
const VOICE_VOLUME_KEY = "@trackline/voiceVolume";

/**
 * voiceEnabled is stored separately from the rest of AppSettings because it can change
 * mid-session via the map's mute button and must survive app restarts on its own —
 * Settings' "default voice guidance" toggle only seeds this value, it doesn't own it.
 */
export async function getVoiceEnabled(fallback: boolean): Promise<boolean> {
  const raw = await AsyncStorage.getItem(VOICE_ENABLED_KEY);
  if (raw === null) return fallback;
  return raw === "true";
}

export async function setVoiceEnabled(value: boolean): Promise<void> {
  await AsyncStorage.setItem(VOICE_ENABLED_KEY, value ? "true" : "false");
}

// Same pattern as voiceEnabled above -- set live from the map's volume slider while
// navigating, persisted so it survives app restarts on its own.
export async function getVoiceVolume(fallback = 1.0): Promise<number> {
  const raw = await AsyncStorage.getItem(VOICE_VOLUME_KEY);
  if (raw === null) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function setVoiceVolume(value: number): Promise<void> {
  await AsyncStorage.setItem(VOICE_VOLUME_KEY, String(value));
}

export function speak(instruction: string, volume = 1.0): void {
  Speech.stop();
  Speech.speak(instruction, { rate: 1.0, pitch: 1.0, volume });
}

export function stopSpeaking(): void {
  Speech.stop();
}
