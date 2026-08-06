import { useEffect, useState } from "react";
import type { AlertType } from "@/types/alert";

export const ALL_ALERT_TYPES: AlertType[] = [
  "police",
  "emergency_vehicle",
  "hazard",
  "camera",
  "crash",
  "traffic_light",
];

// The radius auto-set whenever alertsEnabled flips off -> on -- matches mobile's own spec
// exactly ("if toggled on alerts radius is automatically set for 30kms").
export const DEFAULT_ALERT_RADIUS_KM = 30;

export interface WebSettings {
  alertRadiusKm: number;
  // Master on/off for receiving/showing community alerts at all -- off means none are shown
  // regardless of radius. Mirrors mobile's settings.ts exactly.
  alertsEnabled: boolean;
  // Which AlertTypes to actually show/receive while alertsEnabled is on.
  visibleAlertTypes: AlertType[];
  // Real per-user override (Settings' "Alert lifetime") for how long an alert THIS device
  // reports stays live before auto-expiring, in ms -- null keeps each type's own default
  // (types/alert.ts's ALERT_TTL_MS). Mirrors mobile's settings.ts field exactly.
  alertExpiryMs: number | null;
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
  // Independent of the light/dark UI theme above -- "normal" keeps using that theme's own
  // light/dark map style, the other three are fixed color schemes regardless of light/dark
  // mode. See utils/mapStyles.ts's MAP_THEME_STYLES.
  mapTheme: "normal" | "purpleBlue" | "blueGrey" | "greenYellow";
  // Independent on/off switches for the two OSM overlay marker types -- the underlying
  // Overpass fetch still runs whenever either is on (it's one combined query), but each
  // layer only renders its own markers when its own switch is on. Both on by default.
  showTrafficLights: boolean;
  showSpeedCameras: boolean;
  // How far from the driver's own location that layer is fetched/shown, independent of
  // alertRadiusKm above (community alerts) -- same 1-200km range.
  osmLayerRadiusKm: number;
  // Real NSW government live traffic camera markers (see services/liveTrafficCameras.ts) --
  // a heavier, opt-in layer, off by default, separate from the lightweight OSM signal/camera
  // points above.
  showLiveCameras: boolean;
  // Spoken turn-by-turn guidance during navigation (Web Speech API) -- see services/voice.ts.
  voiceEnabled: boolean;
  voiceVolume: number;
}

const DEFAULT_SETTINGS: WebSettings = {
  alertRadiusKm: 5,
  alertsEnabled: true,
  visibleAlertTypes: ALL_ALERT_TYPES,
  alertExpiryMs: null,
  regionWide: false,
  fixedZone: false,
  hideDetectionTrace: false,
  theme: "system",
  mapTheme: "normal",
  showTrafficLights: true,
  showSpeedCameras: true,
  osmLayerRadiusKm: 5,
  showLiveCameras: false,
  voiceEnabled: true,
  voiceVolume: 1,
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
    // Auto-sets a 30km radius on the off -> on transition, matching mobile's own spec exactly
    // ("if toggled on alerts radius is automatically set for 30kms").
    setAlertsEnabled: (alertsEnabled: boolean) =>
      setSettings((s) => ({
        ...s,
        alertsEnabled,
        alertRadiusKm: alertsEnabled && !s.alertsEnabled ? DEFAULT_ALERT_RADIUS_KM : s.alertRadiusKm,
      })),
    setVisibleAlertTypes: (updater: (types: AlertType[]) => AlertType[]) =>
      setSettings((s) => ({ ...s, visibleAlertTypes: updater(s.visibleAlertTypes) })),
    setAlertExpiryMs: (alertExpiryMs: number | null) => setSettings((s) => ({ ...s, alertExpiryMs })),
    setRegionWide: (regionWide: boolean) => setSettings((s) => ({ ...s, regionWide })),
    setFixedZone: (fixedZone: boolean) => setSettings((s) => ({ ...s, fixedZone })),
    setHideDetectionTrace: (hideDetectionTrace: boolean) =>
      setSettings((s) => ({ ...s, hideDetectionTrace })),
    setTheme: (theme: WebSettings["theme"]) => setSettings((s) => ({ ...s, theme })),
    setMapTheme: (mapTheme: WebSettings["mapTheme"]) => setSettings((s) => ({ ...s, mapTheme })),
    setShowTrafficLights: (showTrafficLights: boolean) =>
      setSettings((s) => ({ ...s, showTrafficLights })),
    setShowSpeedCameras: (showSpeedCameras: boolean) =>
      setSettings((s) => ({ ...s, showSpeedCameras })),
    setOsmLayerRadiusKm: (osmLayerRadiusKm: number) => setSettings((s) => ({ ...s, osmLayerRadiusKm })),
    setShowLiveCameras: (showLiveCameras: boolean) =>
      setSettings((s) => ({ ...s, showLiveCameras })),
    setVoiceEnabled: (voiceEnabled: boolean) => setSettings((s) => ({ ...s, voiceEnabled })),
    setVoiceVolume: (voiceVolume: number) => setSettings((s) => ({ ...s, voiceVolume })),
  };
}
