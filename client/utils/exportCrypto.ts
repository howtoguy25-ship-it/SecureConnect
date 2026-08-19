/**
 * Client-side encryption for the Account Data Export.
 *
 * Mirrors backupCrypto.ts's recovery-code KDF (PBKDF2-SHA256 via WebCrypto,
 * iterated nacl.hash fallback) but keyed off a passphrase the user types at
 * export time instead of a generated recovery code. The passphrase is never
 * sent to the server or stored anywhere — only the person who typed it can
 * ever decrypt the resulting file.
 */
import nacl from "tweetnacl";
import naclUtil from "tweetnacl-util";

const FALLBACK_ITERATIONS = 100_000;

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<Uint8Array> {
  const passBytes = naclUtil.decodeUTF8(passphrase);

  if (typeof globalThis?.crypto?.subtle !== "undefined") {
    try {
      const keyMaterial = await globalThis.crypto.subtle.importKey(
        "raw",
        passBytes.buffer as ArrayBuffer,
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

  const combined = new Uint8Array(passBytes.length + salt.length);
  combined.set(passBytes);
  combined.set(salt, passBytes.length);
  let derived: Uint8Array = combined;
  for (let i = 0; i < FALLBACK_ITERATIONS; i++) {
    const hashed = nacl.hash(derived);
    derived = new Uint8Array(hashed.buffer, hashed.byteOffset, hashed.byteLength);
  }
  return derived.slice(0, 32);
}

export interface EncryptedExportFile {
  format: "pryvo-account-export";
  version: 1;
  salt: string; // base64
  nonce: string; // base64
  ciphertext: string; // base64
}

export async function encryptExportPayload(payload: unknown, passphrase: string): Promise<EncryptedExportFile> {
  const salt = nacl.randomBytes(16);
  const key = await deriveKey(passphrase, salt);
  const nonce = nacl.randomBytes(24);
  const plaintext = naclUtil.decodeUTF8(JSON.stringify(payload));
  const ciphertext = nacl.secretbox(plaintext, nonce, key);

  return {
    format: "pryvo-account-export",
    version: 1,
    salt: naclUtil.encodeBase64(salt),
    nonce: naclUtil.encodeBase64(nonce),
    ciphertext: naclUtil.encodeBase64(ciphertext),
  };
}

export async function decryptExportPayload(file: EncryptedExportFile, passphrase: string): Promise<unknown> {
  const salt = naclUtil.decodeBase64(file.salt);
  const key = await deriveKey(passphrase, salt);
  const nonce = naclUtil.decodeBase64(file.nonce);
  const ciphertext = naclUtil.decodeBase64(file.ciphertext);
  const plaintext = nacl.secretbox.open(ciphertext, nonce, key);
  if (!plaintext) {
    throw new Error("Incorrect passphrase or corrupted file.");
  }
  return JSON.parse(naclUtil.encodeUTF8(plaintext));
}
