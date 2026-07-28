import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type AppSettings,
} from "@/services/settings";
import { getVoiceEnabled, setVoiceEnabled as persistVoiceEnabled } from "@/services/voice";

interface SettingsContextValue {
  settings: AppSettings;
  loaded: boolean;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  voiceEnabled: boolean;
  toggleVoiceEnabled: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue>({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  updateSettings: async () => {},
  voiceEnabled: true,
  toggleVoiceEnabled: async () => {},
});

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [voiceEnabled, setVoiceEnabledState] = useState(true);
  const [loaded, setLoaded] = useState(false);

  // DIAGNOSTIC BUILD -- see src/services/firebase.ts's DIAGNOSTIC_DISABLE_ASYNC_STORAGE_PERSISTENCE
  // for the full rationale. This is the other unconditional-on-every-launch AsyncStorage call
  // site (loadSettings/getVoiceEnabled, both backed by AsyncStorage.getItem), skipped here too
  // so this build isolates AsyncStorage as a whole, not just Firebase's use of it.
  const DIAGNOSTIC_DISABLE_ASYNC_STORAGE_SETTINGS = true;

  useEffect(() => {
    if (DIAGNOSTIC_DISABLE_ASYNC_STORAGE_SETTINGS) {
      setLoaded(true);
      return;
    }
    (async () => {
      const stored = await loadSettings();
      setSettings(stored);
      const voice = await getVoiceEnabled(stored.defaultVoiceEnabled);
      setVoiceEnabledState(voice);
      setLoaded(true);
    })();
  }, []);

  const updateSettings = useCallback(
    async (patch: Partial<AppSettings>) => {
      const next = { ...settings, ...patch };
      setSettings(next);
      await saveSettings(next);
    },
    [settings]
  );

  const toggleVoiceEnabled = useCallback(async () => {
    const next = !voiceEnabled;
    setVoiceEnabledState(next);
    await persistVoiceEnabled(next);
  }, [voiceEnabled]);

  return (
    <SettingsContext.Provider
      value={{ settings, loaded, updateSettings, voiceEnabled, toggleVoiceEnabled }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  return useContext(SettingsContext);
}
