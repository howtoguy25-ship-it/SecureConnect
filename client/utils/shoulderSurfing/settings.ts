import AsyncStorage from "@react-native-async-storage/async-storage";

// Shoulder-surfing / "peek" detection is inherently tied to a single
// device's camera, not the account, so its settings live in local
// AsyncStorage per-device rather than synced through the server (unlike
// e.g. notificationsEnabled on the user row). Each phone the user signs
// into can have its own on/off + cooldown.
const ENABLED_KEY = "peekDetection:enabled";
const COOLDOWN_KEY = "peekDetection:cooldownSeconds";

export const PEEK_COOLDOWN_MIN_SECONDS = 5;
export const PEEK_COOLDOWN_MAX_SECONDS = 7 * 24 * 60 * 60; // 7 days
export const PEEK_COOLDOWN_DEFAULT_SECONDS = 60; // 1 minute
export const PEEK_DIM_DURATION_MS = 5000; // "for 5 seconds"

export interface PeekCooldownPreset {
  label: string;
  seconds: number;
}

export const PEEK_COOLDOWN_PRESETS: PeekCooldownPreset[] = [
  { label: "30 seconds", seconds: 30 },
  { label: "1 minute", seconds: 60 },
  { label: "3 minutes", seconds: 3 * 60 },
  { label: "5 minutes", seconds: 5 * 60 },
  { label: "10 minutes", seconds: 10 * 60 },
  { label: "30 minutes", seconds: 30 * 60 },
  { label: "1 hour", seconds: 60 * 60 },
];

export function clampCooldownSeconds(seconds: number): number {
  if (!Number.isFinite(seconds)) return PEEK_COOLDOWN_DEFAULT_SECONDS;
  return Math.min(PEEK_COOLDOWN_MAX_SECONDS, Math.max(PEEK_COOLDOWN_MIN_SECONDS, Math.round(seconds)));
}

// Lightweight in-process pub/sub so the global ShoulderSurfingGuard picks up
// changes made on the Settings screen immediately, without polling
// AsyncStorage or threading state through a context provider.
type SettingsListener = () => void;
const listeners = new Set<SettingsListener>();
export function subscribePeekSettingsChanged(fn: SettingsListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function notifyPeekSettingsChanged() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {}
  });
}

export async function getPeekDetectionEnabled(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(ENABLED_KEY);
    return v === "true";
  } catch {
    return false;
  }
}

export async function setPeekDetectionEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(ENABLED_KEY, enabled ? "true" : "false");
  notifyPeekSettingsChanged();
}

export async function getPeekCooldownSeconds(): Promise<number> {
  try {
    const v = await AsyncStorage.getItem(COOLDOWN_KEY);
    if (!v) return PEEK_COOLDOWN_DEFAULT_SECONDS;
    return clampCooldownSeconds(parseInt(v, 10));
  } catch {
    return PEEK_COOLDOWN_DEFAULT_SECONDS;
  }
}

export async function setPeekCooldownSeconds(seconds: number): Promise<void> {
  await AsyncStorage.setItem(COOLDOWN_KEY, String(clampCooldownSeconds(seconds)));
  notifyPeekSettingsChanged();
}

// Human-readable formatter for the custom-value confirmation UI (e.g. "2h 30m").
export function formatCooldownSeconds(totalSeconds: number): string {
  const s = clampCooldownSeconds(totalSeconds);
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (seconds || parts.length === 0) parts.push(`${seconds}s`);
  return parts.join(" ");
}
