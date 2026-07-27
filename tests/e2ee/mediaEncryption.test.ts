/**
 * Unit tests for client/utils/crypto/mediaEncryption.ts.
 *
 * Run via `npx jest`.
 *
 * These tests are pure-crypto: no React Native, no SecureStore, no fetch.
 * They roundtrip and tamper-test the "SCM1" wire format defined in
 * docs/e2ee/phase-2-media.md §3.
 */

import nacl from "tweetnacl";
import {
  encryptMedia,
  decryptMedia,
  parseMediaHeader,
  generateMediaKey,
  deriveThumbnailKey,
  HEADER_SIZE,
  MEDIA_VERSION,
  ALGO_XSALSA20_POLY1305,
  FLAG_CHUNKED,
  FLAG_HAS_THUMBNAIL,
  SINGLE_CHUNK_THRESHOLD,
  MAX_FILE_SIZE,
} from "../../client/utils/crypto/mediaEncryption";

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function makePayload(size: number): Uint8Array {
  const out = new Uint8Array(size);
  // Pseudo-random-but-deterministic for reproducibility.
  let x = 0x12345678;
  for (let i = 0; i < size; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    out[i] = x & 0xff;
  }
  return out;
}

describe("mediaEncryption", () => {
  test("generateMediaKey returns 32 unique bytes", () => {
    const a = generateMediaKey();
    const b = generateMediaKey();
    expect(a.length).toBe(32);
    expect(b.length).toBe(32);
    expect(bytesEqual(a, b)).toBe(false);
  });

  test("roundtrip: empty payload", () => {
    const key = generateMediaKey();
    const { ciphertext } = encryptMedia(new Uint8Array(0), key);
    const out = decryptMedia(ciphertext, key);
    expect(out.length).toBe(0);
  });

  test("roundtrip: 1 KiB single-chunk", () => {
    const key = generateMediaKey();
    const plain = makePayload(1024);
    const { ciphertext, chunked } = encryptMedia(plain, key);
    expect(chunked).toBe(false);
    const out = decryptMedia(ciphertext, key);
    expect(bytesEqual(out, plain)).toBe(true);
  });

  test("roundtrip: exactly at 5 MiB threshold = single chunk", () => {
    const key = generateMediaKey();
    const plain = makePayload(SINGLE_CHUNK_THRESHOLD);
    const { ciphertext, chunked } = encryptMedia(plain, key);
    expect(chunked).toBe(false);
    const out = decryptMedia(ciphertext, key);
    expect(bytesEqual(out, plain)).toBe(true);
  });

  test("roundtrip: just over threshold = chunked", () => {
    const key = generateMediaKey();
    const plain = makePayload(SINGLE_CHUNK_THRESHOLD + 1);
    const { ciphertext, chunked } = encryptMedia(plain, key, { chunkSizeOverride: 1024 * 1024 });
    expect(chunked).toBe(true);
    const out = decryptMedia(ciphertext, key);
    expect(bytesEqual(out, plain)).toBe(true);
  });

  test("roundtrip: many small chunks via override", () => {
    const key = generateMediaKey();
    const plain = makePayload(SINGLE_CHUNK_THRESHOLD + 4321);
    const { ciphertext } = encryptMedia(plain, key, { chunkSizeOverride: 4096 });
    const out = decryptMedia(ciphertext, key);
    expect(bytesEqual(out, plain)).toBe(true);
  });

  test("header is parseable and well-formed", () => {
    const key = generateMediaKey();
    const plain = makePayload(2048);
    const { ciphertext, nonceBase } = encryptMedia(plain, key, { hasThumbnail: true });
    const h = parseMediaHeader(ciphertext);
    expect(h.version).toBe(MEDIA_VERSION);
    expect(h.algoId).toBe(ALGO_XSALSA20_POLY1305);
    expect(h.flags & FLAG_HAS_THUMBNAIL).not.toBe(0);
    expect(h.flags & FLAG_CHUNKED).toBe(0);
    expect(h.totalSize).toBe(plain.length);
    expect(bytesEqual(h.nonceBase, nonceBase)).toBe(true);
  });

  test("wrong key fails decrypt", () => {
    const a = generateMediaKey();
    const b = generateMediaKey();
    const { ciphertext } = encryptMedia(makePayload(512), a);
    expect(() => decryptMedia(ciphertext, b)).toThrow(/Authentication failed/);
  });

  test("tampered ciphertext body byte fails", () => {
    const key = generateMediaKey();
    const { ciphertext } = encryptMedia(makePayload(512), key);
    const c = new Uint8Array(ciphertext);
    c[HEADER_SIZE + 10] ^= 0x01;
    expect(() => decryptMedia(c, key)).toThrow(/Authentication failed/);
  });

  test("tampered magic fails", () => {
    const key = generateMediaKey();
    const { ciphertext } = encryptMedia(makePayload(512), key);
    const c = new Uint8Array(ciphertext);
    c[0] = 0x00;
    expect(() => decryptMedia(c, key)).toThrow(/bad magic/);
  });

  test("tampered version fails", () => {
    const key = generateMediaKey();
    const { ciphertext } = encryptMedia(makePayload(512), key);
    const c = new Uint8Array(ciphertext);
    c[4] = 0x02;
    expect(() => decryptMedia(c, key)).toThrow(/Unsupported media version/);
  });

  test("tampered algo id fails", () => {
    const key = generateMediaKey();
    const { ciphertext } = encryptMedia(makePayload(512), key);
    const c = new Uint8Array(ciphertext);
    c[5] = 0x99;
    expect(() => decryptMedia(c, key)).toThrow(/Unsupported algorithm/);
  });

  test("non-zero reserved byte fails", () => {
    const key = generateMediaKey();
    const { ciphertext } = encryptMedia(makePayload(512), key);
    const c = new Uint8Array(ciphertext);
    c[7] = 0x01;
    expect(() => decryptMedia(c, key)).toThrow(/Reserved/);
  });

  test("nonceBase tamper => first chunk auth fails", () => {
    const key = generateMediaKey();
    const { ciphertext } = encryptMedia(makePayload(512), key);
    const c = new Uint8Array(ciphertext);
    c[8] ^= 0xff;
    expect(() => decryptMedia(c, key)).toThrow(/Authentication failed/);
  });

  test("declared total size tamper (smaller) overruns", () => {
    const key = generateMediaKey();
    const { ciphertext } = encryptMedia(makePayload(512), key);
    const c = new Uint8Array(ciphertext);
    const v = new DataView(c.buffer, c.byteOffset, c.byteLength);
    v.setUint32(28, 100, true);
    v.setUint32(32, 0, true);
    expect(() => decryptMedia(c, key)).toThrow(/overruns|Size mismatch/);
  });

  test("truncation: drop final 'final' flip", () => {
    const key = generateMediaKey();
    const plain = makePayload(SINGLE_CHUNK_THRESHOLD + 100);
    const { ciphertext } = encryptMedia(plain, key, { chunkSizeOverride: 1024 });
    const c = new Uint8Array(ciphertext);
    const view = new DataView(c.buffer, c.byteOffset, c.byteLength);
    let cursor = HEADER_SIZE;
    let lastFinalOffset = -1;
    while (cursor < c.length) {
      const len = view.getUint32(cursor, true);
      const finalOffset = cursor + 4;
      cursor += 5 + len;
      if (c[finalOffset] === 0x01) {
        lastFinalOffset = finalOffset;
        break;
      }
    }
    expect(lastFinalOffset).toBeGreaterThan(0);
    c[lastFinalOffset] = 0x00;
    const truncated = c.slice(0, cursor);
    expect(() => decryptMedia(truncated, key)).toThrow(/Truncated stream/);
  });

  test("truncated body fails before auth", () => {
    const key = generateMediaKey();
    const { ciphertext } = encryptMedia(makePayload(2048), key);
    const truncated = ciphertext.slice(0, ciphertext.length - 5);
    expect(() => decryptMedia(truncated, key)).toThrow(/Truncated|Authentication/);
  });

  test("over-max plaintext throws on encrypt", () => {
    const key = generateMediaKey();
    const tooBig = new Uint8Array(MAX_FILE_SIZE + 1);
    expect(() => encryptMedia(tooBig, key)).toThrow(/exceeds max attachment size/);
  });

  test("declared total size > MAX_FILE_SIZE in header is rejected", () => {
    const key = generateMediaKey();
    const { ciphertext } = encryptMedia(makePayload(512), key);
    const c = new Uint8Array(ciphertext);
    const v = new DataView(c.buffer, c.byteOffset, c.byteLength);
    const v2 = MAX_FILE_SIZE + 1;
    v.setUint32(28, v2 >>> 0, true);
    v.setUint32(32, Math.floor(v2 / 0x100000000) >>> 0, true);
    expect(() => decryptMedia(c, key)).toThrow(/exceeds max/);
  });

  test("deriveThumbnailKey is deterministic", () => {
    const mediaKey = generateMediaKey();
    const nonceBase = nacl.randomBytes(16);
    const t1 = deriveThumbnailKey(mediaKey, nonceBase);
    const t2 = deriveThumbnailKey(mediaKey, nonceBase);
    expect(bytesEqual(t1, t2)).toBe(true);
    expect(t1.length).toBe(32);
  });

  test("deriveThumbnailKey is independent of mediaKey", () => {
    const mediaKey = generateMediaKey();
    const nonceBase = nacl.randomBytes(16);
    const thumb = deriveThumbnailKey(mediaKey, nonceBase);
    expect(bytesEqual(thumb, mediaKey)).toBe(false);
  });

  test("different nonceBase => different thumbnail key", () => {
    const mediaKey = generateMediaKey();
    const a = deriveThumbnailKey(mediaKey, nacl.randomBytes(16));
    const b = deriveThumbnailKey(mediaKey, nacl.randomBytes(16));
    expect(bytesEqual(a, b)).toBe(false);
  });

  test("encryption is non-deterministic (random nonceBase)", () => {
    const key = generateMediaKey();
    const plain = makePayload(256);
    const a = encryptMedia(plain, key);
    const b = encryptMedia(plain, key);
    expect(bytesEqual(a.ciphertext, b.ciphertext)).toBe(false);
    expect(bytesEqual(a.nonceBase, b.nonceBase)).toBe(false);
  });

  test("rejects wrong-sized media key", () => {
    expect(() => encryptMedia(new Uint8Array(0), new Uint8Array(16))).toThrow(/must be 32 bytes/);
    expect(() => decryptMedia(new Uint8Array(HEADER_SIZE + 5), new Uint8Array(16))).toThrow(
      /must be 32 bytes/,
    );
  });
});
