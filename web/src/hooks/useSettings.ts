import { useEffect, useState } from "react";

export interface WebSettings {
  alertRadiusKm: number;
  // When true, ignore the radius entirely and show every non-expired alert (e.g. all of
  // Australia) so everyone in the region sees the same set.
  regionWide: boolean;
  // When true, the alert-visibility circle stays centered on wherever it was when you
  // turned this on, instead of always re-centering on your live position.
  fixedZone: boolean;
  // When true, the AI Detection camera view during navigation skips drawing its route
  // guide line/turn instructions -- for drivers who know the way and just want the
  // vehicle detection, without the extra overlay. Only affects that camera view; the
  // actual route on the main map is untouched either way.
  hideDetectionTrace: boolean;
  // "system" follows the OS/browser's prefers-color-scheme; "light"/"dark" is an explicit
  // override. Note: only affects the app's own UI chrome. The map tiles themselves only
  // switch to a dark style too when no custom Map ID is configured (see App.tsx) -- Google
  // ignores inline tile styling on Map ID-based vector maps, so a custom Map ID would need
  // its own dark variant configured in Cloud Console to fully match.
  theme: "system" | "light" | "dark";
  // Independent on/off switches for the two OSM overlay marker types -- the underlying
  // Overpass fetch still runs whenever either is on (it's one combined query), but each
  // layer only renders its own markers when its own switch is on. Both on by default.
  showTrafficLights: boolean;
  showSpeedCameras: boolean;
}

const DEFAULT_SETTINGS: WebSettings = {
  alertRadiusKm: 5,
  regionWide: false,
  fixedZone: false,
  hideDetectionTrace: false,
  theme: "system",
  showTrafficLights: true,
  showSpeedCameras: true,
};
const STORAGE_KEY = "trackline.settings";

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
    setHideDetectionTrace: (hideDetectionTrace: boolean) =>
      setSettings((s) => ({ ...s, hideDetectionTrace })),
    setTheme: (theme: WebSettings["theme"]) => setSettings((s) => ({ ...s, theme })),
    setShowTrafficLights: (showTrafficLights: boolean) =>
      setSettings((s) => ({ ...s, showTrafficLights })),
    setShowSpeedCameras: (showSpeedCameras: boolean) =>
      setSettings((s) => ({ ...s, showSpeedCameras })),
  };
}
