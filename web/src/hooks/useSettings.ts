import { useEffect, useState } from "react";
import type { AlertType } from "@/types/alert";
import type { AuRegionCode } from "@/utils/auStates";

export const ALL_ALERT_TYPES: AlertType[] = [
  "police",
  "emergency_vehicle",
  "hazard",
  "camera",
  "crash",
  "traffic_light",
];

export interface WebSettings {
  // Real Australian state/territory selection -- replaces the old 1-200km alertRadiusKm slider
  // and the regionWide/fixedZone toggles, per explicit request. A driver sees every non-expired
  // alert in every region they've toggled on, regardless of distance. Empty until the
  // first-launch auto-detect effect (see App.tsx) seeds it with whichever region the browser's
  // own current location falls in. Mirrors mobile's settings.ts field exactly.
  visibleRegions: AuRegionCode[];
  // Master on/off for receiving/showing community alerts at all -- off means none are shown
  // regardless of which regions are toggled on. Mirrors mobile's settings.ts exactly.
  alertsEnabled: boolean;
  // Which AlertTypes to actually show/receive while alertsEnabled is on.
  visibleAlertTypes: AlertType[];
  // Real per-user override (Settings' "Alert lifetime") for how long an alert THIS device
  // reports stays live before auto-expiring, in ms -- null keeps each type's own default
  // (types/alert.ts's ALERT_TTL_MS). Mirrors mobile's settings.ts field exactly.
  alertExpiryMs: number | null;
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
  // How far from the driver's own location that layer is fetched/shown -- independent of
  // visibleRegions above (community alerts), which is region-based rather than a radius.
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
  // Empty on a fresh load -- App.tsx's first-launch effect seeds this with whichever region
  // the browser's own current location falls in, the moment a real fix comes in.
  visibleRegions: [],
  alertsEnabled: true,
  visibleAlertTypes: ALL_ALERT_TYPES,
  alertExpiryMs: null,
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
    setVisibleRegions: (updater: (regions: AuRegionCode[]) => AuRegionCode[]) =>
      setSettings((s) => ({ ...s, visibleRegions: updater(s.visibleRegions) })),
    setAlertsEnabled: (alertsEnabled: boolean) => setSettings((s) => ({ ...s, alertsEnabled })),
    setVisibleAlertTypes: (updater: (types: AlertType[]) => AlertType[]) =>
      setSettings((s) => ({ ...s, visibleAlertTypes: updater(s.visibleAlertTypes) })),
    setAlertExpiryMs: (alertExpiryMs: number | null) => setSettings((s) => ({ ...s, alertExpiryMs })),
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
