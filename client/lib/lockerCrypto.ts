import nacl from "tweetnacl";
import naclUtil from "tweetnacl-util";
import scrypt from "scrypt-js";

export const LOCKER_SCRYPT_N = 1 << 14;
export const LOCKER_SCRYPT_R = 8;
export const LOCKER_SCRYPT_P = 1;
export const LOCKER_KEY_BYTES = 32;

export async function deriveLockerKey(pin: string, saltB64: string): Promise<Uint8Array> {
  const pwBytes = new TextEncoder().encode(pin.normalize("NFKC"));
  const salt = naclUtil.decodeBase64(saltB64);
  const out = await scrypt.scrypt(
    pwBytes,
    salt,
    LOCKER_SCRYPT_N,
    LOCKER_SCRYPT_R,
    LOCKER_SCRYPT_P,
    LOCKER_KEY_BYTES
  );
  return new Uint8Array(out);
}

export function generateSalt(): string {
  return naclUtil.encodeBase64(nacl.randomBytes(32));
}

export interface LockerCipherFields {
  ciphertext: string;
  nonce: string;
}

export interface LockerPlaintext {
  type: string;
  content: string | null;
  mediaUrl: string | null;
  messageId: string | null;
}

export function encryptLockerItem(plaintext: LockerPlaintext, masterKey: Uint8Array): LockerCipherFields {
  if (masterKey.length !== LOCKER_KEY_BYTES) throw new Error("Locker key length");
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const msg = new TextEncoder().encode(JSON.stringify(plaintext));
  const box = nacl.secretbox(msg, nonce, masterKey);
  return {
    ciphertext: naclUtil.encodeBase64(box),
    nonce: naclUtil.encodeBase64(nonce),
  };
}

export function decryptLockerItem(fields: LockerCipherFields, masterKey: Uint8Array): LockerPlaintext {
  if (masterKey.length !== LOCKER_KEY_BYTES) throw new Error("Locker key length");
  const box = naclUtil.decodeBase64(fields.ciphertext);
  const nonce = naclUtil.decodeBase64(fields.nonce);
  const opened = nacl.secretbox.open(box, nonce, masterKey);
  if (!opened) throw new Error("Decryption failed — wrong key or tampered data");
  const json = new TextDecoder().decode(opened);
  return JSON.parse(json) as LockerPlaintext;
}

export function zeroKey(key: Uint8Array): void {
  for (let i = 0; i < key.length; i++) key[i] = 0;
}
