/**
 * Secure local storage for all E2EE key material and session state.
 * Private keys and ratchet state never leave this device.
 */

import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import type { RatchetState } from "./doubleRatchet";

const KEY_PRIVATE = "e2ee_private_key";
const SESSION_PREFIX = "e2ee_session_";
// JSON array of all theirUserIds that currently have a saved session.
// Required because SecureStore on native has no "list keys" primitive — we
// have to track them ourselves to be able to wipe them all on logout.
const SESSION_INDEX = "e2ee_session_index";

// ─── Session index helpers (native only — web walks localStorage directly) ──

async function loadSessionIndex(): Promise<string[]> {
  const raw = await secureGet(SESSION_INDEX);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

async function saveSessionIndex(ids: string[]): Promise<void> {
  const unique = Array.from(new Set(ids));
  await secureSet(SESSION_INDEX, JSON.stringify(unique));
}

async function addToSessionIndex(userId: string): Promise<void> {
  if (Platform.OS === "web") return; // web doesn't need the index
  const ids = await loadSessionIndex();
  if (!ids.includes(userId)) {
    ids.push(userId);
    await saveSessionIndex(ids);
  }
}

async function removeFromSessionIndex(userId: string): Promise<void> {
  if (Platform.OS === "web") return;
  const ids = await loadSessionIndex();
  const next = ids.filter(id => id !== userId);
  if (next.length !== ids.length) {
    await saveSessionIndex(next);
  }
}

// ─── Generic secure store helpers ────────────────────────────────────────────

async function secureGet(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    try { return localStorage.getItem(key); } catch { return null; }
  }
  return SecureStore.getItemAsync(key);
}

async function secureSet(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    try { localStorage.setItem(key, value); } catch {}
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function secureDelete(key: string): Promise<void> {
  if (Platform.OS === "web") {
    try { localStorage.removeItem(key); } catch {}
    return;
  }
  try { await SecureStore.deleteItemAsync(key); } catch {}
}

// ─── Identity private key (X25519) ───────────────────────────────────────────

export async function savePrivateKey(key: string): Promise<void> {
  await secureSet(KEY_PRIVATE, key);
}

export async function getPrivateKey(): Promise<string | null> {
  return secureGet(KEY_PRIVATE);
}

// ─── Double Ratchet session state ─────────────────────────────────────────────

/**
 * Persist a ratchet session for a given peer user.
 * Pass null to clear (delete) the session.
 */
export async function saveSession(theirUserId: string, state: RatchetState | null): Promise<void> {
  const key = `${SESSION_PREFIX}${theirUserId}`;
  if (state === null) {
    await secureDelete(key);
    await removeFromSessionIndex(theirUserId);
    return;
  }
  await secureSet(key, JSON.stringify(state));
  await addToSessionIndex(theirUserId);
}

/**
 * Load the ratchet session for a given peer user.
 * Returns null if no session exists or if the stored data is corrupted.
 */
export async function loadSession(theirUserId: string): Promise<RatchetState | null> {
  const key = `${SESSION_PREFIX}${theirUserId}`;
  const raw = await secureGet(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as RatchetState;
  } catch {
    await secureDelete(key);
    return null;
  }
}

/**
 * Clear all sessions for all peers (e.g. on logout or key reset).
 *
 * Smoke test (mental model):
 *   await saveSession("alice", state1)   // index = ["alice"]
 *   await saveSession("bob",   state2)   // index = ["alice","bob"]
 *   await loadSession("alice")           // → state1
 *   await clearAllSessions()             // walks index, deletes each session, clears index
 *   await loadSession("alice")           // → null
 *   await loadSession("bob")             // → null
 *   index after clear                    // → []
 */
export async function clearAllSessions(): Promise<void> {
  if (Platform.OS === "web") {
    try {
      const keys = Object.keys(localStorage).filter(k => k.startsWith(SESSION_PREFIX));
      keys.forEach(k => localStorage.removeItem(k));
    } catch {}
    return;
  }

  // Native: walk the index, delete each session, then clear the index.
  const ids = await loadSessionIndex();
  for (const userId of ids) {
    try {
      await secureDelete(`${SESSION_PREFIX}${userId}`);
    } catch {
      // best-effort — keep going so a single bad entry doesn't leave the rest behind
    }
  }
  await secureDelete(SESSION_INDEX);
}

// ─── Wipe-on-logout (Phase 2 build 62) ───────────────────────────────────────

/**
 * Wipe ALL E2EE material from this device.
 *
 * Called by `clearAuth()` (client/lib/api-utils.ts) on logout, account
 * suspension, and account deletion. Before this existed, logout cleared the
 * JWT but left the private identity key, signing key, signed prekeys,
 * one-time prekeys, and per-peer ratchet sessions on disk indefinitely — a
 * live security gap for anyone using a shared / borrowed device.
 *
 * Composition:
 *   - clearAllSessions()         (above) deletes every per-peer Double
 *                                Ratchet session blob + the session index.
 *   - wipeAllPrekeyMaterial()    (prekeyManager.ts) deletes identity DH
 *                                secret, signing key pair, every signed
 *                                prekey, every one-time prekey, and the id
 *                                lists.
 *
 * Order matters: wipe sessions first (small, fast), then prekeys (more
 * SecureStore writes). Failures inside either step must not block the other.
 */
export async function wipeE2EEKeys(): Promise<void> {
  // Lazy require to avoid a circular import (prekeyManager doesn't import
  // keyStorage today but might in future; the lazy edge is free insurance).
  try {
    await clearAllSessions();
  } catch (e) {
    if (__DEV__) console.warn("[E2EE] clearAllSessions failed during wipe:", e);
  }
  try {
    const { wipeAllPrekeyMaterial } = await import("./prekeyManager");
    await wipeAllPrekeyMaterial();
  } catch (e) {
    if (__DEV__) console.warn("[E2EE] wipeAllPrekeyMaterial failed during wipe:", e);
  }
  // Also wipe any cached decrypted media on disk — these were end-to-end
  // encrypted in transit but live as PLAINTEXT in FileSystem.cacheDirectory
  // for fast re-render. Leaving them after logout defeats the point of E2EE.
  try {
    const { wipeDecryptedMediaCache } = await import("./encryptedMediaClient");
    await wipeDecryptedMediaCache();
  } catch (e) {
    if (__DEV__) console.warn("[E2EE] wipeDecryptedMediaCache failed during wipe:", e);
  }
}
