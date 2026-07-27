/**
 * Encrypted Backup Crypto
 *
 * Generates a recovery code and uses it to encrypt/decrypt
 * the user's E2EE identity keys stored in SecureStore.
 *
 * - Recovery code: 24 hex chars (12 random bytes, 96 bits), formatted as XXXX-XXXX-XXXX-XXXX-XXXX-XXXX
 * - Key derivation: PBKDF2-SHA256 (200k iterations) via Web Crypto; iterated nacl.hash fallback
 * - Encryption: XSalsa20-Poly1305 (nacl.secretbox)
 *
 * Backup format versions (kdfVersion on the BackupBlob):
 *   1  — legacy: 1,000 iterations of nacl.hash on the fallback path. Still
 *        accepted for decryption so existing backups in the wild keep working.
 *   2  — current: 100,000 iterations of nacl.hash on the fallback path.
 *        WebCrypto path is unchanged (always 200k PBKDF2-SHA256) regardless of
 *        kdfVersion, since browsers can afford it.
 * Missing kdfVersion is treated as version 1 for backward compatibility.
 */

import nacl from "tweetnacl";
import naclUtil from "tweetnacl-util";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

// ─── Recovery Code ───────────────────────────────────────────────────────────

/**
 * Generates a 24-char hex recovery code (96 bits of entropy).
 * Format: XXXX-XXXX-XXXX-XXXX-XXXX-XXXX
 */
export function generateRecoveryCode(): string {
  const bytes = nacl.randomBytes(12);
  const hex = Array.from(bytes)
    .map((b: number) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 24)}`;
}

// ─── Key derivation ──────────────────────────────────────────────────────────

// Iteration counts for the nacl.hash fallback path, keyed by kdfVersion.
const FALLBACK_ITERATIONS: Record<number, number> = {
  1: 1_000,    // legacy backups
  2: 100_000,  // current
};
const CURRENT_KDF_VERSION = 2;

async function deriveKey(recoveryCode: string, saltBase64: string, kdfVersion: number): Promise<Uint8Array> {
  const salt = naclUtil.decodeBase64(saltBase64);
  const codeBytes = naclUtil.decodeUTF8(recoveryCode.replace(/-/g, ""));

  if (typeof globalThis?.crypto?.subtle !== "undefined") {
    try {
      const keyMaterial = await globalThis.crypto.subtle.importKey(
        "raw",
        codeBytes.buffer as ArrayBuffer,
        { name: "PBKDF2" },
        false,
        ["deriveBits"]
      );
      const bits = await globalThis.crypto.subtle.deriveBits(
        { name: "PBKDF2", salt: salt.buffer as ArrayBuffer, iterations: 200_000, hash: "SHA-256" },
        keyMaterial,
        256
      );
      return new Uint8Array(bits);
    } catch {
      // fall through to nacl fallback
    }
  }

  // Fallback: iterate SHA-512 (nacl.hash) and truncate.
  // Iteration count depends on the backup version so we stay compatible with
  // old backups while making new ones stronger.
  const iterations = FALLBACK_ITERATIONS[kdfVersion] ?? FALLBACK_ITERATIONS[1];
  const combined = new Uint8Array(codeBytes.length + salt.length);
  combined.set(codeBytes);
  combined.set(salt, codeBytes.length);
  let derived: Uint8Array = combined;
  for (let i = 0; i < iterations; i++) {
    const hashed = nacl.hash(derived);
    derived = new Uint8Array(hashed.buffer, hashed.byteOffset, hashed.byteLength);
  }
  return new Uint8Array(derived.buffer.slice(0, 32));
}

// ─── Backup keys list ────────────────────────────────────────────────────────

const BACKUP_KEYS = [
  "e2ee_private_key",
  "e2ee_identity_public",
  "e2ee_signing_private_key",
  "e2ee_signing_public_key",
];

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

// ─── Encrypt ─────────────────────────────────────────────────────────────────

export interface BackupBlob {
  encryptedBlob: string;
  salt: string;
  nonce: string;
  // KDF version. Absent/undefined means legacy v1 (1,000 fallback iterations).
  // New backups are written with kdfVersion: 2 (100,000 fallback iterations).
  kdfVersion?: number;
}

/**
 * Read all E2EE keys from SecureStore and encrypt them with the recovery code.
 * Returns a BackupBlob to upload to the server.
 */
export async function encryptBackup(recoveryCode: string): Promise<BackupBlob | null> {
  const keyMap: Record<string, string> = {};
  for (const k of BACKUP_KEYS) {
    const val = await secureGet(k);
    if (val) keyMap[k] = val;
  }
  if (Object.keys(keyMap).length === 0) return null;

  const saltBytes = nacl.randomBytes(32);
  const salt = naclUtil.encodeBase64(saltBytes);
  const derivedKey = await deriveKey(recoveryCode, salt, CURRENT_KDF_VERSION);

  const plaintext = naclUtil.decodeUTF8(JSON.stringify(keyMap));
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const ciphertext = nacl.secretbox(plaintext, nonce, derivedKey);

  return {
    encryptedBlob: naclUtil.encodeBase64(ciphertext),
    salt,
    nonce: naclUtil.encodeBase64(nonce),
    kdfVersion: CURRENT_KDF_VERSION,
  };
}

// ─── Decrypt ─────────────────────────────────────────────────────────────────

/**
 * Decrypt a backup blob using the recovery code and restore keys to SecureStore.
 * Returns true on success, false if the recovery code is wrong or blob is corrupt.
 */
export async function decryptAndRestoreBackup(
  recoveryCode: string,
  blob: BackupBlob
): Promise<boolean> {
  try {
    // Missing kdfVersion → treat as legacy v1 (1k iterations). New backups
    // are written with kdfVersion: 2 (100k iterations).
    const kdfVersion = blob.kdfVersion ?? 1;
    const derivedKey = await deriveKey(recoveryCode, blob.salt, kdfVersion);
    const ciphertext = naclUtil.decodeBase64(blob.encryptedBlob);
    const nonce = naclUtil.decodeBase64(blob.nonce);
    const plaintext = nacl.secretbox.open(ciphertext, nonce, derivedKey);
    if (!plaintext) return false;

    const keyMap: Record<string, string> = JSON.parse(naclUtil.encodeUTF8(plaintext));
    for (const [k, v] of Object.entries(keyMap)) {
      await secureSet(k, v);
    }
    return true;
  } catch {
    return false;
  }
}
