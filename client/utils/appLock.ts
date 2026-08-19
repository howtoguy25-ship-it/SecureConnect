/**
 * App-unlock PIN — a local, device-only quick-lock gate shown on cold
 * launch and after the app has been backgrounded past its timeout.
 *
 * Deliberately independent of the account's real credentials (phone/SMS,
 * Account ID + security questions): this PIN never leaves the device and
 * is never sent to the server. Forgetting it just means signing back in
 * with the real account credentials — see clearAppLockPin(), called from
 * AuthContext's logout().
 *
 * Hashing mirrors backupCrypto.ts's recovery-code KDF: PBKDF2-SHA256 via
 * WebCrypto where available, else iterated nacl.hash (SHA-512) fallback.
 */
import nacl from "tweetnacl";
import naclUtil from "tweetnacl-util";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

export type AppLockMode = "numeric" | "alphanumeric";

const RECORD_KEY = "pryvo_app_lock_v1";
const FALLBACK_ITERATIONS = 100_000;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 30_000;

interface AppLockRecord {
  hash: string; // base64
  salt: string; // base64
  mode: AppLockMode;
  // Digit count for numeric mode only — lets the lock screen auto-submit
  // once enough digits are typed. Never the PIN itself.
  length: number;
  // 0 = lock immediately on background; otherwise seconds of grace before
  // a resume requires re-entry.
  timeoutSeconds: number;
  failedAttempts: number;
  lockedUntil: number | null;
}

async function secureGet(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    try { return localStorage.getItem(key); } catch { return null; }
  }
  try { return await SecureStore.getItemAsync(key); } catch { return null; }
}

async function secureSet(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    try { localStorage.setItem(key, value); } catch {}
    return;
  }
  try { await SecureStore.setItemAsync(key, value); } catch {}
}

async function secureDelete(key: string): Promise<void> {
  if (Platform.OS === "web") {
    try { localStorage.removeItem(key); } catch {}
    return;
  }
  try { await SecureStore.deleteItemAsync(key); } catch {}
}

async function hashPin(pin: string, saltB64: string): Promise<string> {
  const salt = naclUtil.decodeBase64(saltB64);
  const pinBytes = naclUtil.decodeUTF8(pin);

  if (typeof globalThis?.crypto?.subtle !== "undefined") {
    try {
      const keyMaterial = await globalThis.crypto.subtle.importKey(
        "raw",
        pinBytes.buffer as ArrayBuffer,
        { name: "PBKDF2" },
        false,
        ["deriveBits"]
      );
      const bits = await globalThis.crypto.subtle.deriveBits(
        { name: "PBKDF2", salt: salt.buffer as ArrayBuffer, iterations: 200_000, hash: "SHA-256" },
        keyMaterial,
        256
      );
      return naclUtil.encodeBase64(new Uint8Array(bits));
    } catch {
      // fall through to nacl fallback
    }
  }

  const combined = new Uint8Array(pinBytes.length + salt.length);
  combined.set(pinBytes);
  combined.set(salt, pinBytes.length);
  let derived: Uint8Array = combined;
  // Hermes has no crypto.subtle, so this fallback runs on EVERY PIN
  // submit on every device (not just as a rare fallback). Run tight, it
  // blocks the JS thread for the whole loop — no touch handling, no state
  // flush, nothing — for as long as it takes, which reads as the app
  // "freezing" mid-tap. Yielding back to the event loop every YIELD_EVERY
  // iterations keeps the total work (and therefore the resulting hash)
  // identical while letting RN actually paint the "checking..." state and
  // process queued touches between chunks instead of locking up.
  const YIELD_EVERY = 2000;
  for (let i = 0; i < FALLBACK_ITERATIONS; i++) {
    const hashed = nacl.hash(derived);
    derived = new Uint8Array(hashed.buffer, hashed.byteOffset, hashed.byteLength);
    if (i % YIELD_EVERY === YIELD_EVERY - 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  return naclUtil.encodeBase64(derived.slice(0, 32));
}

type Listener = () => void;
const listeners = new Set<Listener>();

/** Subscribe to PIN set/change/clear so the lock gate can react without polling. */
export function subscribeAppLockChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notifyChange() {
  listeners.forEach((fn) => fn());
}

async function readRecord(): Promise<AppLockRecord | null> {
  const raw = await secureGet(RECORD_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AppLockRecord;
  } catch {
    return null;
  }
}

async function writeRecord(record: AppLockRecord): Promise<void> {
  await secureSet(RECORD_KEY, JSON.stringify(record));
}

export async function hasAppLockPin(): Promise<boolean> {
  return (await readRecord()) !== null;
}

export async function getAppLockSettings(): Promise<{ mode: AppLockMode; length: number; timeoutSeconds: number } | null> {
  const record = await readRecord();
  if (!record) return null;
  return { mode: record.mode, length: record.length, timeoutSeconds: record.timeoutSeconds };
}

export async function setAppLockPin(pin: string, mode: AppLockMode, timeoutSeconds = 0): Promise<void> {
  const salt = naclUtil.encodeBase64(nacl.randomBytes(16));
  const hash = await hashPin(pin, salt);
  const record: AppLockRecord = {
    hash,
    salt,
    mode,
    length: pin.length,
    timeoutSeconds,
    failedAttempts: 0,
    lockedUntil: null,
  };
  await writeRecord(record);
  notifyChange();
}

export async function setAppLockTimeout(timeoutSeconds: number): Promise<void> {
  const record = await readRecord();
  if (!record) return;
  record.timeoutSeconds = timeoutSeconds;
  await writeRecord(record);
  notifyChange();
}

/** Seconds remaining before another attempt is allowed, or 0 if not locked out. */
export async function getLockoutSecondsRemaining(): Promise<number> {
  const record = await readRecord();
  if (!record?.lockedUntil) return 0;
  const remaining = Math.ceil((record.lockedUntil - Date.now()) / 1000);
  return remaining > 0 ? remaining : 0;
}

export async function verifyAppLockPin(pin: string): Promise<boolean> {
  const record = await readRecord();
  if (!record) return false;

  if (record.lockedUntil && record.lockedUntil > Date.now()) {
    return false;
  }

  const hash = await hashPin(pin, record.salt);
  const matches = hash === record.hash;

  if (matches) {
    record.failedAttempts = 0;
    record.lockedUntil = null;
  } else {
    record.failedAttempts = (record.failedAttempts ?? 0) + 1;
    if (record.failedAttempts >= MAX_FAILED_ATTEMPTS) {
      record.lockedUntil = Date.now() + LOCKOUT_MS;
      record.failedAttempts = 0;
    }
  }
  await writeRecord(record);
  return matches;
}

export async function clearAppLockPin(): Promise<void> {
  await secureDelete(RECORD_KEY);
  notifyChange();
}
