/**
 * Signal Double Ratchet Algorithm
 *
 * Implements the Double Ratchet as specified at:
 * https://signal.org/docs/specifications/doubleratchet/
 *
 * KDF_RK  → HKDF-SHA512(rk, dh_out, "WhisperRatchet") → (new_rk, ck)
 * KDF_CK  → HMAC-SHA512(ck, 0x01) = mk; HMAC-SHA512(ck, 0x02) = new_ck
 * ENCRYPT → XSalsa20-Poly1305 (nacl.secretbox) with random 24-byte nonce
 * MAX_SKIP = 1000 (maximum out-of-order messages buffered)
 */

import nacl from "tweetnacl";
import naclUtil from "tweetnacl-util";
import { hkdf, hmacSha512 } from "./hkdf";

const RATCHET_INFO = new TextEncoder().encode("WhisperRatchet");
const MAX_SKIP = 1000;

export interface RatchetKeyPair {
  publicKey: string;   // base64
  secretKey: string;   // base64
}

export interface RatchetState {
  DHs: RatchetKeyPair;              // My sending ratchet key pair
  DHr: string | null;               // Their current ratchet public key (base64)
  RK: string;                       // Root key (base64-32 bytes)
  CKs: string | null;               // Sending chain key (base64)
  CKr: string | null;               // Receiving chain key (base64)
  Ns: number;                       // Send counter
  Nr: number;                       // Receive counter
  PN: number;                       // Previous send chain length
  MKSKIPPED: Record<string, string>;// "b64pubkey:msgnum" → b64 msg key
}

export interface MessageHeader {
  dh: string;   // Sender's current ratchet public key (base64)
  pn: number;   // Previous chain message count
  n: number;    // Message number in current chain
  v: 2;         // Version
}

export interface EncryptedEnvelope {
  header: MessageHeader;
  ciphertext: string;  // base64
  nonce: string;       // base64
}

function generateDH(): RatchetKeyPair {
  const kp = nacl.box.keyPair();
  return {
    publicKey: naclUtil.encodeBase64(kp.publicKey),
    secretKey: naclUtil.encodeBase64(kp.secretKey),
  };
}

function dh(mySecret: string, theirPublic: string): Uint8Array {
  return nacl.scalarMult(
    naclUtil.decodeBase64(mySecret),
    naclUtil.decodeBase64(theirPublic)
  );
}

function kdfRK(rk: string, dhOut: Uint8Array): { newRK: string; ck: string } {
  const rkBytes = naclUtil.decodeBase64(rk);
  const out = hkdf(dhOut, rkBytes, RATCHET_INFO, 64);
  return {
    newRK: naclUtil.encodeBase64(out.slice(0, 32)),
    ck: naclUtil.encodeBase64(out.slice(32, 64)),
  };
}

function kdfCK(ck: string): { messageKey: string; newCK: string } {
  const ckBytes = naclUtil.decodeBase64(ck);
  const mk = hmacSha512(ckBytes, new Uint8Array([0x01])).slice(0, 32);
  const newCK = hmacSha512(ckBytes, new Uint8Array([0x02])).slice(0, 32);
  return {
    messageKey: naclUtil.encodeBase64(mk),
    newCK: naclUtil.encodeBase64(newCK),
  };
}

function encrypt(messageKey: string, plaintext: string): { ciphertext: string; nonce: string } {
  const mk = naclUtil.decodeBase64(messageKey);
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const msg = naclUtil.decodeUTF8(plaintext);
  const ct = nacl.secretbox(msg, nonce, mk);
  return {
    ciphertext: naclUtil.encodeBase64(ct),
    nonce: naclUtil.encodeBase64(nonce),
  };
}

function decrypt(messageKey: string, ciphertext: string, nonce: string): string | null {
  try {
    const mk = naclUtil.decodeBase64(messageKey);
    const ct = naclUtil.decodeBase64(ciphertext);
    const n = naclUtil.decodeBase64(nonce);
    const plain = nacl.secretbox.open(ct, n, mk);
    if (!plain) return null;
    return naclUtil.encodeUTF8(plain);
  } catch {
    return null;
  }
}

function skippedKey(dhPub: string, n: number): string {
  return `${dhPub}:${n}`;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Initialise the sender side after X3DH.
 * SK = shared key from X3DH, DHr = recipient's signed prekey public key
 */
export function initSenderState(SK: Uint8Array, DHr_pub: string): RatchetState {
  const rk = naclUtil.encodeBase64(SK);
  const DHs = generateDH();
  const dhOut = dh(DHs.secretKey, DHr_pub);
  const { newRK, ck } = kdfRK(rk, dhOut);
  return {
    DHs,
    DHr: DHr_pub,
    RK: newRK,
    CKs: ck,
    CKr: null,
    Ns: 0,
    Nr: 0,
    PN: 0,
    MKSKIPPED: {},
  };
}

/**
 * Initialise the receiver side after X3DH.
 * SK = shared key from X3DH, DHs = receiver's signed prekey pair
 */
export function initReceiverState(
  SK: Uint8Array,
  DHs_pub: string,
  DHs_secret: string
): RatchetState {
  return {
    DHs: { publicKey: DHs_pub, secretKey: DHs_secret },
    DHr: null,
    RK: naclUtil.encodeBase64(SK),
    CKs: null,
    CKr: null,
    Ns: 0,
    Nr: 0,
    PN: 0,
    MKSKIPPED: {},
  };
}

/**
 * Encrypt a plaintext message. Returns new state + envelope.
 */
export function ratchetEncrypt(
  state: RatchetState,
  plaintext: string
): { newState: RatchetState; envelope: EncryptedEnvelope } {
  if (!state.CKs) throw new Error("No sending chain key – session not initialised for sending");
  const { messageKey, newCK } = kdfCK(state.CKs);
  const header: MessageHeader = {
    dh: state.DHs.publicKey,
    pn: state.PN,
    n: state.Ns,
    v: 2,
  };
  const { ciphertext, nonce } = encrypt(messageKey, plaintext);
  return {
    newState: { ...state, CKs: newCK, Ns: state.Ns + 1 },
    envelope: { header, ciphertext, nonce },
  };
}

/**
 * Decrypt an incoming envelope. Returns new state + plaintext.
 * Handles out-of-order messages by caching skipped keys.
 */
export function ratchetDecrypt(
  state: RatchetState,
  envelope: EncryptedEnvelope
): { newState: RatchetState; plaintext: string } {
  let s = { ...state, MKSKIPPED: { ...state.MKSKIPPED } };
  const { header, ciphertext, nonce } = envelope;

  const cached = s.MKSKIPPED[skippedKey(header.dh, header.n)];
  if (cached) {
    const plain = decrypt(cached, ciphertext, nonce);
    if (!plain) throw new Error("Failed to decrypt cached skipped message key");
    delete s.MKSKIPPED[skippedKey(header.dh, header.n)];
    return { newState: s, plaintext: plain };
  }

  if (header.dh !== s.DHr) {
    s = skipMessageKeys(s, header.pn);
    s = dhRatchet(s, header);
  }

  s = skipMessageKeys(s, header.n);

  if (!s.CKr) throw new Error("No receiving chain key after ratchet step");
  const { messageKey, newCK } = kdfCK(s.CKr);
  s = { ...s, CKr: newCK, Nr: s.Nr + 1 };

  const plaintext = decrypt(messageKey, ciphertext, nonce);
  if (!plaintext) throw new Error("Decryption failed – wrong key or corrupted payload");
  return { newState: s, plaintext };
}

function skipMessageKeys(state: RatchetState, until: number): RatchetState {
  if (state.Nr + MAX_SKIP < until) throw new Error("Too many skipped messages");
  let s = { ...state, MKSKIPPED: { ...state.MKSKIPPED } };
  if (s.CKr === null) return s;
  while (s.Nr < until) {
    const { messageKey, newCK } = kdfCK(s.CKr!);
    s.MKSKIPPED[skippedKey(s.DHr!, s.Nr)] = messageKey;
    s = { ...s, CKr: newCK, Nr: s.Nr + 1 };
  }
  return s;
}

function dhRatchet(state: RatchetState, header: MessageHeader): RatchetState {
  const s = { ...state };
  s.PN = s.Ns;
  s.Ns = 0;
  s.Nr = 0;
  s.DHr = header.dh;
  const dhOut1 = dh(s.DHs.secretKey, s.DHr);
  const { newRK: rk1, ck: ckr } = kdfRK(s.RK, dhOut1);
  const newDHs = generateDH();
  const dhOut2 = dh(newDHs.secretKey, s.DHr);
  const { newRK: rk2, ck: cks } = kdfRK(rk1, dhOut2);
  return { ...s, DHs: newDHs, RK: rk2, CKr: ckr, CKs: cks };
}
