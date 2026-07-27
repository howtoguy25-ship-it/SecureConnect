import nacl from "tweetnacl";
import { hkdf } from "./hkdf";

/**
 * Phase 2 — Encrypted media wire format ("SCM1").
 *
 * Per docs/e2ee/phase-2-media.md §3. Self-describing chunked format using
 * XSalsa20-Poly1305 (nacl.secretbox). 24-byte per-chunk nonce derived as
 * nonceBase(16) || counter_le8(8) so a single CSPRNG call protects an entire
 * file from internal collisions.
 *
 * Header (36 bytes):
 *   0-3   MAGIC       "SCM1"
 *   4     VERSION     0x01
 *   5     ALGO_ID     0x01 = XSalsa20-Poly1305
 *   6     FLAGS       bit0 chunked, bit1 has_thumbnail
 *   7     RESERVED    0x00
 *   8-23  NONCE_BASE  16 random bytes
 *   24-27 CHUNK_SIZE  uint32 LE (0 = single-chunk)
 *   28-35 TOTAL_SIZE  uint64 LE plaintext bytes
 *
 * Chunk frame:
 *   0-3   CHUNK_LEN   uint32 LE ciphertext length (includes 16-byte Poly1305 tag)
 *   4     FINAL       0x00 or 0x01
 *   5..   CIPHERTEXT  nacl.secretbox output
 */

const MAGIC = new Uint8Array([0x53, 0x43, 0x4d, 0x31]); // "SCM1"
export const MEDIA_VERSION = 0x01;
export const ALGO_XSALSA20_POLY1305 = 0x01;
export const FLAG_CHUNKED = 0x01;
export const FLAG_HAS_THUMBNAIL = 0x02;

export const HEADER_SIZE = 36;
export const CHUNK_SIZE = 1024 * 1024; // 1 MiB plaintext per chunk
export const SINGLE_CHUNK_THRESHOLD = 5 * 1024 * 1024; // 5 MiB
export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MiB hard cap

// HKDF domain-separation tag for thumbnail key derivation. WIRE-PROTOCOL
// STRING — DO NOT RENAME. Renaming would make every previously-encrypted
// thumbnail undecryptable across the install base.
const THUMB_INFO = new TextEncoder().encode("SecureConnect-Media-v1-thumb");

function writeU32LE(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value >>> 0, true);
}

function writeU64LE(view: DataView, offset: number, value: number): void {
  // Safe up to Number.MAX_SAFE_INTEGER (2^53). Our 50 MiB cap is well under that.
  const lo = value >>> 0;
  const hi = Math.floor(value / 0x100000000) >>> 0;
  view.setUint32(offset, lo, true);
  view.setUint32(offset + 4, hi, true);
}

function readU32LE(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

function readU64LE(view: DataView, offset: number): number {
  const lo = view.getUint32(offset, true);
  const hi = view.getUint32(offset + 4, true);
  return hi * 0x100000000 + lo;
}

function chunkNonce(nonceBase: Uint8Array, counter: number): Uint8Array {
  if (nonceBase.length !== 16) throw new Error("nonceBase must be 16 bytes");
  const nonce = new Uint8Array(24);
  nonce.set(nonceBase, 0);
  const view = new DataView(nonce.buffer, nonce.byteOffset + 16, 8);
  view.setUint32(0, counter >>> 0, true);
  view.setUint32(4, Math.floor(counter / 0x100000000) >>> 0, true);
  return nonce;
}

/** 32 fresh random bytes. Use once per attachment. Never reuse. */
export function generateMediaKey(): Uint8Array {
  return nacl.randomBytes(32);
}

/**
 * Derive a thumbnail-only subkey from the parent media key.
 * info string is versioned "v1" so a future format bump is unambiguous.
 * Uses the existing project HKDF (HMAC-SHA512 backbone, truncated to 32 bytes).
 */
export function deriveThumbnailKey(mediaKey: Uint8Array, nonceBase: Uint8Array): Uint8Array {
  if (mediaKey.length !== 32) throw new Error("mediaKey must be 32 bytes");
  if (nonceBase.length !== 16) throw new Error("nonceBase must be 16 bytes");
  return hkdf(mediaKey, nonceBase, THUMB_INFO, 32);
}

export interface EncryptResult {
  ciphertext: Uint8Array;
  nonceBase: Uint8Array;
  chunked: boolean;
}

export interface EncryptOptions {
  hasThumbnail?: boolean;
  /** Override CHUNK_SIZE; tests only. Must be > 0. */
  chunkSizeOverride?: number;
}

/**
 * Encrypt a media payload to the "SCM1" wire format.
 * Throws if mediaKey is the wrong length or plaintext exceeds MAX_FILE_SIZE.
 */
export function encryptMedia(
  plaintext: Uint8Array,
  mediaKey: Uint8Array,
  opts: EncryptOptions = {},
): EncryptResult {
  if (mediaKey.length !== 32) throw new Error("mediaKey must be 32 bytes");
  if (plaintext.length > MAX_FILE_SIZE) {
    throw new Error(`Plaintext exceeds max attachment size of ${MAX_FILE_SIZE} bytes`);
  }

  const nonceBase = nacl.randomBytes(16);
  const chunked = plaintext.length > SINGLE_CHUNK_THRESHOLD;
  const effectiveChunkSize = chunked
    ? (opts.chunkSizeOverride ?? CHUNK_SIZE)
    : Math.max(plaintext.length, 1);
  const chunkSizeForHeader = chunked ? effectiveChunkSize : 0;

  let flags = 0;
  if (chunked) flags |= FLAG_CHUNKED;
  if (opts.hasThumbnail) flags |= FLAG_HAS_THUMBNAIL;

  const header = new Uint8Array(HEADER_SIZE);
  header.set(MAGIC, 0);
  header[4] = MEDIA_VERSION;
  header[5] = ALGO_XSALSA20_POLY1305;
  header[6] = flags;
  header[7] = 0;
  header.set(nonceBase, 8);
  const hView = new DataView(header.buffer, header.byteOffset, header.byteLength);
  writeU32LE(hView, 24, chunkSizeForHeader);
  writeU64LE(hView, 28, plaintext.length);

  const frames: Uint8Array[] = [header];

  if (plaintext.length === 0) {
    // Well-formed empty: one final chunk carrying just the tag.
    const nonce = chunkNonce(nonceBase, 0);
    const ct = nacl.secretbox(new Uint8Array(0), nonce, mediaKey);
    frames.push(buildChunkFrame(ct, true));
  } else {
    let offset = 0;
    let counter = 0;
    while (offset < plaintext.length) {
      const end = Math.min(offset + effectiveChunkSize, plaintext.length);
      const chunk = plaintext.subarray(offset, end);
      const nonce = chunkNonce(nonceBase, counter);
      const ct = nacl.secretbox(chunk, nonce, mediaKey);
      const isFinal = end >= plaintext.length;
      frames.push(buildChunkFrame(ct, isFinal));
      offset = end;
      counter++;
    }
  }

  return { ciphertext: concat(frames), nonceBase, chunked };
}

function buildChunkFrame(ct: Uint8Array, isFinal: boolean): Uint8Array {
  const frame = new Uint8Array(5 + ct.length);
  const fView = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  writeU32LE(fView, 0, ct.length);
  frame[4] = isFinal ? 0x01 : 0x00;
  frame.set(ct, 5);
  return frame;
}

function concat(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const p of parts) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}

export interface MediaHeader {
  version: number;
  algoId: number;
  flags: number;
  nonceBase: Uint8Array;
  chunkSize: number;
  totalSize: number;
}

/** Parse + validate the SCM1 header. Throws on malformed input. */
export function parseMediaHeader(ciphertext: Uint8Array): MediaHeader {
  if (ciphertext.length < HEADER_SIZE) throw new Error("Ciphertext too short for header");
  for (let i = 0; i < MAGIC.length; i++) {
    if (ciphertext[i] !== MAGIC[i]) throw new Error("Invalid media format (bad magic)");
  }
  const version = ciphertext[4];
  const algoId = ciphertext[5];
  const flags = ciphertext[6];
  const reserved = ciphertext[7];
  if (version !== MEDIA_VERSION) {
    throw new Error(`Unsupported media version: ${version}`);
  }
  if (algoId !== ALGO_XSALSA20_POLY1305) {
    throw new Error(`Unsupported algorithm: ${algoId}`);
  }
  if (reserved !== 0) throw new Error("Reserved header byte must be zero");
  const view = new DataView(ciphertext.buffer, ciphertext.byteOffset, ciphertext.byteLength);
  const nonceBase = ciphertext.slice(8, 24);
  const chunkSize = readU32LE(view, 24);
  const totalSize = readU64LE(view, 28);
  if (totalSize > MAX_FILE_SIZE) {
    throw new Error(`Declared total size ${totalSize} exceeds max ${MAX_FILE_SIZE}`);
  }
  return { version, algoId, flags, nonceBase, chunkSize, totalSize };
}

/**
 * Decrypt an "SCM1" payload. Throws on:
 *   - bad magic / version / algo / reserved byte
 *   - wrong key (indistinguishable from tampered ciphertext, by design)
 *   - tampered ciphertext (Poly1305 verification fail)
 *   - truncated stream (no final chunk seen)
 *   - size mismatch vs declared header total
 *   - chunks overrun declared total
 */
export function decryptMedia(ciphertext: Uint8Array, mediaKey: Uint8Array): Uint8Array {
  if (mediaKey.length !== 32) throw new Error("mediaKey must be 32 bytes");
  const header = parseMediaHeader(ciphertext);
  const view = new DataView(ciphertext.buffer, ciphertext.byteOffset, ciphertext.byteLength);

  const out = new Uint8Array(header.totalSize);
  let outPos = 0;
  let cursor = HEADER_SIZE;
  let counter = 0;
  let sawFinal = false;

  while (cursor < ciphertext.length) {
    if (cursor + 5 > ciphertext.length) throw new Error("Truncated chunk header");
    const chunkLen = readU32LE(view, cursor);
    const finalByte = ciphertext[cursor + 4];
    cursor += 5;
    if (finalByte !== 0x00 && finalByte !== 0x01) {
      throw new Error(`Invalid final byte: 0x${finalByte.toString(16)}`);
    }
    if (cursor + chunkLen > ciphertext.length) throw new Error("Truncated chunk body");
    const ct = ciphertext.subarray(cursor, cursor + chunkLen);
    cursor += chunkLen;

    const nonce = chunkNonce(header.nonceBase, counter);
    const plain = nacl.secretbox.open(ct, nonce, mediaKey);
    if (!plain) throw new Error("Authentication failed (tampered ciphertext or wrong key)");

    if (outPos + plain.length > out.length) {
      throw new Error("Chunk overruns declared total size");
    }
    out.set(plain, outPos);
    outPos += plain.length;
    counter++;

    if (finalByte === 0x01) {
      sawFinal = true;
      break;
    }
  }

  if (!sawFinal) throw new Error("Truncated stream: no final chunk");
  if (outPos !== header.totalSize) {
    throw new Error(`Size mismatch: decrypted ${outPos} bytes, header declared ${header.totalSize}`);
  }
  if (cursor !== ciphertext.length) {
    throw new Error("Trailing bytes after final chunk");
  }

  return out;
}
