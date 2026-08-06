import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AlertType } from "@/types/alert";
import type { MapThemeKey } from "@/utils/mapStyle";
import type { NavCardThemeKey } from "@/utils/navCardTheme";

export const ALL_ALERT_TYPES: AlertType[] = [
  "police",
  "emergency_vehicle",
  "hazard",
  "camera",
  "crash",
  "traffic_light",
];

// The radius auto-set whenever alertsEnabled flips off -> on (see SettingsScreen) -- the
// user's own spec: "if toggled on alerts radius is automatically set for 30kms".
export const DEFAULT_ALERT_RADIUS_KM = 30;

export interface AppSettings {
  alertRadiusKm: number; // 1-200km
  // Master on/off for receiving/showing community alerts (police/camera/crash/etc.) at all --
  // off means none are shown regardless of radius, matching the user's "if toggled off user
  // who is active doesn't receive no alerts" spec.
  alertsEnabled: boolean;
  // Which AlertTypes to actually show/receive while alertsEnabled is on -- lets a driver
  // e.g. only care about police + hazards and not crashes.
  visibleAlertTypes: AlertType[];
  autoShareDetections: boolean; // default false (opt-in)
  sirenSensitivity: number; // confidence threshold 0-1, default 0.6
  defaultVoiceEnabled: boolean; // initial voiceEnabled value on launch
  // Static, permanently-mapped OSM infrastructure layer (every known traffic light / speed
  // camera location) -- independent of the live community AlertType "camera"/"traffic_light"
  // reports above, which are temporary/mobile and user-submitted.
  showTrafficLights: boolean;
  showSpeedCameras: boolean;
  // How far from the driver's own location that layer is fetched/shown, independent of
  // alertRadiusKm above (community alerts) -- same 1-200km range and slider pattern.
  osmLayerRadiusKm: number; // 1-200km
  // Which map color theme customMapStyle renders -- see utils/mapStyle.ts.
  mapTheme: MapThemeKey;
  // Which color theme the navigation instruction card renders -- see utils/navCardTheme.ts.
  navCardTheme: NavCardThemeKey;
  // Real override for how long an alert THIS device reports stays live before it auto-expires
  // and disappears for everyone -- null means "use the app's own per-type defaults"
  // (types/alert.ts's ALERT_TTL_MS: 45min for police/emergency vehicle, 2h for hazard/crash/
  // traffic light, 24h for camera), matching behavior before this setting existed. Set in
  // milliseconds so services/alerts.ts's reportAlert can use it directly without reconverting.
  alertExpiryMs: number | null;
}

export const DEFAULT_SETTINGS: AppSettings = {
  alertRadiusKm: 5,
  alertsEnabled: true,
  visibleAlertTypes: ALL_ALERT_TYPES,
  autoShareDetections: false,
  sirenSensitivity: 0.6,
  defaultVoiceEnabled: true,
  showTrafficLights: true,
  showSpeedCameras: true,
  osmLayerRadiusKm: 5,
  mapTheme: "normal",
  navCardTheme: "dark",
  alertExpiryMs: null,
};

const STORAGE_KEY = "@trackline/settings";

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
