import { useEffect, useState } from "react";

export interface WebSettings {
  alertRadiusKm: number;
  // When true, ignore the radius entirely and show every non-expired alert (e.g. all of
  // Australia) so everyone in the region sees the same set.
  regionWide: boolean;
  // When true, the alert-visibility circle stays centered on wherever it was when you
  // turned this on, instead of always re-centering on your live position.
  fixedZone: boolean;
}

const DEFAULT_SETTINGS: WebSettings = { alertRadiusKm: 5, regionWide: false, fixedZone: false };
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
    setRegionWide: (regionWide: boolean) => setSettings((s) => ({ ...s, regionWide })),
    setFixedZone: (fixedZone: boolean) => setSettings((s) => ({ ...s, fixedZone })),
  };
}
