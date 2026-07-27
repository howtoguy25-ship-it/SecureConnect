import AsyncStorage from "@react-native-async-storage/async-storage";

// Lazy-loaded so test/server bundles that import this module (via the
// `User` type re-export in sealedSender / route handlers) don't drag
// in `expo-secure-store` or `react-native`'s Platform, both of which
// are native-only ESM modules Jest can't transform under our current
// preset. Resolving them on first call keeps the type-only imports of
// `User` cheap for test bundles.
type SecureStoreModule = typeof import("expo-secure-store");
let secureStoreModule: SecureStoreModule | null = null;
async function getSecureStore(): Promise<SecureStoreModule | null> {
  if (secureStoreModule) return secureStoreModule;
  try {
    secureStoreModule = await import("expo-secure-store");
    return secureStoreModule;
  } catch {
    return null;
  }
}

let platformOS: string | null = null;
function getPlatformOS(): string {
  if (platformOS) return platformOS;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const RN = require("react-native");
    platformOS = RN?.Platform?.OS ?? "ios";
  } catch {
    platformOS = "ios";
  }
  return platformOS!;
}

const TOKEN_KEY = "auth_token";
const USER_KEY = "auth_user";

// Item 1 of the production-readiness fix list: move the JWT off
// `AsyncStorage` (plain-text on disk, included in OS-level backups,
// readable by anything with filesystem access) onto `expo-secure-store`
// (iOS Keychain / Android Keystore-backed encrypted blob). The user row
// stays in AsyncStorage because (a) it isn't a credential and (b) it
// frequently exceeds SecureStore's 2 KB per-value Android ceiling.
//
// Web has no SecureStore implementation, so on web we keep the old
// AsyncStorage path. The web target is dev-only — production binaries
// ship to iOS/Android.
function useSecureStorePlatform(): boolean {
  return getPlatformOS() !== "web";
}

async function readTokenFromSecureStore(): Promise<string | null> {
  const SecureStore = await getSecureStore();
  if (!SecureStore) return null;
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

// One-time migration: existing installs have the JWT in AsyncStorage
// under the same key. On first read after upgrade, move it to
// SecureStore and clear the plaintext copy. Guarded by an idempotent
// flag so we don't keep paying the AsyncStorage read forever.
let migrationDone = false;
async function migrateTokenIfNeeded(): Promise<string | null> {
  if (migrationDone || !useSecureStorePlatform()) return null;
  const SecureStore = await getSecureStore();
  if (!SecureStore) return null;
  try {
    const legacy = await AsyncStorage.getItem(TOKEN_KEY);
    if (legacy) {
      await SecureStore.setItemAsync(TOKEN_KEY, legacy);
      await AsyncStorage.removeItem(TOKEN_KEY);
      migrationDone = true;
      return legacy;
    }
    migrationDone = true;
    return null;
  } catch {
    // Don't flip the flag — retry next call.
    return null;
  }
}

export interface User {
  id: string;
  phoneNumber: string;
  displayName: string | null;
  avatarIndex: number;
  avatarUrl: string | null;
  isVip: boolean;
  isAdFree: boolean;
  lastNameChangeAt: string | null;
  vipStartedAt: string | null;
  notificationsEnabled?: boolean;
  virtualNumberId?: string | null;
  preferredNumberType?: string | null;
  lastSeenPrivacy?: string | null;
  safeCodeAcknowledged?: boolean;
  hasSafeCode?: boolean;
  // Story privacy — account-level audience gate (server also returns these;
  // see server/routes.ts GET /api/auth/me). Used client-side to decide
  // whether a new story's audience is bounded enough to E2EE.
  storyPrivacyMode?: string;
  storyPrivacyExceptIds?: string[];
  storyPrivacyOnlyIds?: string[];
  readReceiptsEnabled?: boolean;
  typingIndicatorsEnabled?: boolean;
  showNotificationPreview?: boolean;
  defaultDisappearingTimer?: number;
  // Build 63 Phase A — sealed-sender client UI fields. `virtualNumber` is
  // the joined VN row (status, phoneNumber, ...) so the composer can
  // disable itself when the number is released/suspended without a
  // separate round trip. `supportsSealedSender` is the recipient-side
  // capability flag the SENDER reads to decide whether to call
  // /send-sealed or fall back to legacy /messages.
  supportsSealedSender?: boolean;
  virtualNumber?: {
    id: string;
    phoneNumber: string;
    status: string;
    countryCode?: string | null;
  } | null;
}

export async function getStoredToken(): Promise<string | null> {
  try {
    if (useSecureStorePlatform()) {
      const fromSecure = await readTokenFromSecureStore();
      if (fromSecure) return fromSecure;
      // Cold-start after upgrade — migrate from AsyncStorage if present.
      return await migrateTokenIfNeeded();
    }
    return await AsyncStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function getStoredUser(): Promise<User | null> {
  try {
    const userStr = await AsyncStorage.getItem(USER_KEY);
    return userStr ? JSON.parse(userStr) : null;
  } catch {
    return null;
  }
}

export async function storeAuth(token: string, user: User): Promise<void> {
  if (useSecureStorePlatform()) {
    const SecureStore = await getSecureStore();
    if (SecureStore) {
      await SecureStore.setItemAsync(TOKEN_KEY, token);
      // Belt-and-braces: nuke any stale AsyncStorage copy from a previous
      // build so two sources of truth can't drift.
      await AsyncStorage.removeItem(TOKEN_KEY).catch(() => {});
      migrationDone = true;
    } else {
      // SecureStore unavailable (test/web fallback) — keep token in
      // AsyncStorage rather than failing the login.
      await AsyncStorage.setItem(TOKEN_KEY, token);
    }
  } else {
    await AsyncStorage.setItem(TOKEN_KEY, token);
  }
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
}

export async function storeUser(user: User): Promise<void> {
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
}

export async function clearAuth(): Promise<void> {
  if (useSecureStorePlatform()) {
    const SecureStore = await getSecureStore();
    if (SecureStore) {
      await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
    }
    // Defensive: clear any legacy copy too.
    await AsyncStorage.removeItem(TOKEN_KEY).catch(() => {});
    migrationDone = true;
  } else {
    await AsyncStorage.removeItem(TOKEN_KEY);
  }
  await AsyncStorage.removeItem(USER_KEY);
  // Phase 2 build 62 — wipe ALL E2EE material on logout / suspension /
  // account deletion. Before this, logout cleared the JWT but left private
  // identity keys, signed prekeys, one-time prekeys, and per-peer ratchet
  // sessions on disk indefinitely (live security gap on shared devices).
  // Lazy import so importing api-utils.ts at server-bundle time (some
  // shared code paths) doesn't drag in expo-secure-store / tweetnacl.
  try {
    const { wipeE2EEKeys } = await import("@/utils/crypto/keyStorage");
    await wipeE2EEKeys();
  } catch (e) {
    // Best-effort: never block logout because of a wipe failure. The
    // alternative — leaving the user "logged in" because we couldn't wipe —
    // is strictly worse.
    if (typeof __DEV__ !== "undefined" && (__DEV__ as unknown as boolean)) {
      console.warn("[clearAuth] wipeE2EEKeys failed:", e);
    }
  }
}

export function getApiUrl(): string {
  let host = process.env.EXPO_PUBLIC_DOMAIN;

  if (!host) {
    try {
      const Constants = require("expo-constants").default;
      const configUrl = Constants?.expoConfig?.extra?.API_URL;
      if (configUrl) return configUrl.endsWith("/") ? configUrl : configUrl + "/";
    } catch {}
    return "https://pryvoapp.com/";
  }

  let url = new URL(`https://${host}`);

  return url.href;
}

type SuspensionListener = (reason: string) => void;
let suspensionListener: SuspensionListener | null = null;
export function setSuspensionListener(fn: SuspensionListener | null) {
  suspensionListener = fn;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;

    // Try to parse JSON error message for cleaner display
    try {
      const json = JSON.parse(text);
      // Apple Guideline 1.2 — server-side suspension. Notify the app so it can
      // force-logout and explain why.
      if (res.status === 403 && json?.suspended) {
        try { suspensionListener?.(json.reason || "Account suspended"); } catch {}
        throw new Error(json.reason || "Your account has been suspended");
      }
      if (json.error) {
        throw new Error(json.error);
      }
    } catch (e) {
      if (e instanceof Error && e.message) throw e;
      // If parsing fails, use raw text
    }

    throw new Error(text || `Request failed with status ${res.status}`);
  }
}

// Shared timeout wrapper for the raw `fetch` calls that bypass apiRequest
// (screens that manage their own loading spinner). Aborts after `timeoutMs`
// and rethrows a friendly, user-facing message so a hung request can never
// leave a spinner running forever (App Store 5.6). Do NOT use this for media
// uploads/downloads — those legitimately run longer than 10s.
export async function fetchWithTimeout(
  input: URL | string,
  init: RequestInit = {},
  timeoutMs = 10000,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input as any, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(
        "The request timed out. Please check your connection and try again.",
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function apiRequest(
  method: string,
  route: string,
  data?: unknown | undefined,
): Promise<Response> {
  const baseUrl = getApiUrl();
  const url = new URL(route, baseUrl);
  const token = await getStoredToken();

  const headers: Record<string, string> = {};
  if (data) {
    headers["Content-Type"] = "application/json";
  }
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  // Guard every mutation (login, verify, PIN unlock, VIP purchase, etc.)
  // against a hung server/connection: abort after 10s so a stalled request
  // surfaces a friendly error instead of an infinite spinner
  // (App Store 5.6 — no indefinitely-loading UI).
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include",
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(
        "The request timed out. Please check your connection and try again.",
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  await throwIfResNotOk(res);
  return res;
}
