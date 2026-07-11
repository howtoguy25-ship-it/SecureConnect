import { useEffect, useState } from "react";

export interface WebSettings {
  alertRadiusKm: number;
}

const DEFAULT_SETTINGS: WebSettings = { alertRadiusKm: 5 };
const STORAGE_KEY = "secureconnect.settings";

export function useSettings() {
  const [settings, setSettings] = useState<WebSettings>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  return {
    settings,
    setAlertRadiusKm: (alertRadiusKm: number) => setSettings((s) => ({ ...s, alertRadiusKm })),
  };
}
