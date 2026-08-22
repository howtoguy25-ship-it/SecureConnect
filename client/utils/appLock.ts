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
// Records written before this field existed have no `kdfIterations` and
// must keep verifying against the count they were actually hashed with —
// this is what that hash was computed at, so it's the correct fallback for
// old records, never a "current default."
const LEGACY_FALLBACK_ITERATIONS = 100_000;
// New PINs use a much lower count. This gate protects a device already in
// the owner's hand (physical possession + jailbreak/root is the realistic
// threat model, not a remote brute-force of the SecureStore blob), so the
// extreme iteration count from backupCrypto's recovery-code KDF — a much
// higher-value secret — isn't needed here. 100k (and even the earlier
// "fixed" 20k) iterations of pure-JS SHA-512 (no WebCrypto on Hermes)
// still ran long enough on real devices to read as "the PIN screen takes
// 20 seconds." 4k is small enough to run fully synchronously (see
// hashPin below — no yielding needed at this size) while still being a
// real KDF stretch, not a bare single hash.
const NEW_ITERATIONS = 4_000;
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
  // Absent on records written before this field existed — those must be
  // verified at LEGACY_FALLBACK_ITERATIONS, the count they were actually
  // hashed with, or the stored hash will never match again.
  kdfIterations?: number;
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

async function hashPin(pin: string, saltB64: string, iterations: number): Promise<string> {
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
  // Hermes has no crypto.subtle, so this fallback runs on EVERY PIN submit
  // on every device (not just as a rare fallback). Two earlier attempts at
  // "yield periodically so the UI stays responsive" both backfired: each
  // `setTimeout(resolve, 0)` round-trip through RN's timer bridge cost far
  // more than the hashing work itself, so more yields — or fewer, bigger
  // ones — still added up to real seconds of wall-clock time. No more
  // yielding at all: at NEW_ITERATIONS (4k) the loop finishes fast enough
  // that blocking the JS thread for it is imperceptible. A pre-existing
  // PIN still hashed at the old 100k count pays one genuinely slow
  // synchronous unlock — bounded, not the mystery multiplied-by-yields
  // slowness — and then self-heals to the fast count (see
  // verifyAppLockPin) so every unlock after that is instant.
  for (let i = 0; i < iterations; i++) {
    const hashed = nacl.hash(derived);
    derived = new Uint8Array(hashed.buffer, hashed.byteOffset, hashed.byteLength);
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

export async function setAppLockPin(pin: string, mode: AppLockMode, timeoutSeconds = 60): Promise<void> {
  const salt = naclUtil.encodeBase64(nacl.randomBytes(16));
  const hash = await hashPin(pin, salt, NEW_ITERATIONS);
  const record: AppLockRecord = {
    hash,
    salt,
    mode,
    length: pin.length,
    timeoutSeconds,
    failedAttempts: 0,
    lockedUntil: null,
    kdfIterations: NEW_ITERATIONS,
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

  const recordIterations = record.kdfIterations ?? LEGACY_FALLBACK_ITERATIONS;
  const hash = await hashPin(pin, record.salt, recordIterations);
  const matches = hash === record.hash;

  if (matches) {
    record.failedAttempts = 0;
    record.lockedUntil = null;
    // Self-healing: a PIN set before NEW_ITERATIONS existed (or set at an
    // earlier, higher value) just proved itself correct at the slow
    // count — re-hash it now at the fast count so every unlock after
    // this one is instant instead of paying the slow path forever. Only
    // the PIN owner, who just typed it correctly, can trigger this.
    if (recordIterations > NEW_ITERATIONS) {
      const newSalt = naclUtil.encodeBase64(nacl.randomBytes(16));
      record.salt = newSalt;
      record.hash = await hashPin(pin, newSalt, NEW_ITERATIONS);
      record.kdfIterations = NEW_ITERATIONS;
    }
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
