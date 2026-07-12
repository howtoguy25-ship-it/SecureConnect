import AsyncStorage from "@react-native-async-storage/async-storage";

export interface AppSettings {
  alertRadiusKm: number; // 1-15, default 5
  autoShareDetections: boolean; // default false (opt-in)
  sirenSensitivity: number; // confidence threshold 0-1, default 0.6
  defaultVoiceEnabled: boolean; // initial voiceEnabled value on launch
}

export const DEFAULT_SETTINGS: AppSettings = {
  alertRadiusKm: 5,
  autoShareDetections: false,
  sirenSensitivity: 0.6,
  defaultVoiceEnabled: true,
};

const STORAGE_KEY = "@tracklive/settings";

export async function loadSettings(): Promise<AppSettings> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
