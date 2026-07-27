/**
 * Phase 2 build 62 — encrypted-media upload + download helpers.
 *
 * This wraps `mediaEncryption.ts` (pure SCM1 wire format) with the I/O code
 * that talks to expo-file-system and the server. Kept separate from the pure
 * crypto so the crypto module stays trivially unit-testable under jest
 * without dragging in any React-Native-only deps.
 *
 * Wire flow on SEND:
 *   1. Read plaintext file → bytes
 *   2. Generate fresh 32-byte mediaKey
 *   3. encryptMedia() → SCM1 ciphertext bytes
 *   4. Write ciphertext to a temp file inside FileSystem.cacheDirectory
 *   5. POST /api/objects/upload to get a signed PUT URL
 *   6. PUT ciphertext to GCS
 *   7. PUT /api/objects/media to normalize the objectPath
 *   8. Return { objectPath, mediaKey, size, mediaType } for envelope build-up
 *
 * Wire flow on RECEIVE:
 *   1. Caller has parsed the SCM1 envelope from a decrypted message text
 *      (see `parseMediaEnvelope` / `buildMediaEnvelope` below)
 *   2. GET /api/media/encrypted/<objectPath> with Bearer token (rate-limited)
 *   3. decryptMedia() → plaintext bytes
 *   4. Write plaintext to FileSystem.cacheDirectory/decrypted-media/<id>.<ext>
 *   5. Return local file URI for <Image> / video / audio rendering
 *
 * "Session-only" cache: lives in FileSystem.cacheDirectory which Expo / iOS /
 * Android may evict at will. We additionally keep an in-memory id→uri map at
 * the call-site (see ConversationScreen) so re-renders inside the same screen
 * lifetime are O(1), but nothing here is meant to survive an app restart.
 */

import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import naclUtil from "tweetnacl-util";
import {
  encryptMedia,
  decryptMedia,
  generateMediaKey,
  MAX_FILE_SIZE,
} from "./mediaEncryption";

// Feature flag — flip to false to disable the new encrypted path at runtime
// without removing it from the bundle (so QA can A/B the two flows).
export const E2EE_MEDIA_ENABLED = true;

// Envelope marker — recipients detect this prefix in the decrypted message
// text to know the bubble is an encrypted media reference. Distinct from the
// v1.0.6 `__SC_CONTACT_V1__` prefix so the two flows never collide.
export const MEDIA_ENVELOPE_PREFIX = "__SC_MEDIA_V1__";

const CACHE_SUBDIR = "decrypted-media";

export interface MediaEnvelope {
  v: 1;
  /** Base64 mediaKey (32 bytes). Must never leave the encrypted message body. */
  mk: string;
  /** Server-relative object path, e.g. "/objects/uploads/<uuid>" */
  path: string;
  /** "image" | "video" | "audio" — matches existing mediaType column values */
  mt: "image" | "video" | "audio";
  /** Plaintext size in bytes (for UI / sanity check before download). */
  size: number;
  /** Optional file extension hint for the local cache file. */
  ext?: string;
}

export function buildMediaEnvelope(env: MediaEnvelope): string {
  return MEDIA_ENVELOPE_PREFIX + JSON.stringify(env);
}

/**
 * Parse a decrypted message body. Returns null if the body is not an
 * encrypted-media envelope (regular text / contact card / etc).
 *
 * Defensive: any malformed envelope is treated as "not a media message"
 * rather than throwing, so a corrupt or future-version envelope never breaks
 * the conversation render.
 */
export function parseMediaEnvelope(body: string | null | undefined): MediaEnvelope | null {
  if (!body || !body.startsWith(MEDIA_ENVELOPE_PREFIX)) return null;
  try {
    const json = body.slice(MEDIA_ENVELOPE_PREFIX.length);
    const parsed = JSON.parse(json) as MediaEnvelope;
    if (parsed?.v !== 1) return null;
    if (typeof parsed.mk !== "string" || typeof parsed.path !== "string") return null;
    if (parsed.mt !== "image" && parsed.mt !== "video" && parsed.mt !== "audio") return null;
    if (typeof parsed.size !== "number" || parsed.size < 0 || parsed.size > MAX_FILE_SIZE) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

// ─── Upload ──────────────────────────────────────────────────────────────────

export interface UploadResult {
  envelope: MediaEnvelope;
  /** Plaintext size (for caller bookkeeping). */
  size: number;
}

/**
 * Encrypt the file at `uri` and upload the ciphertext.
 * Returns the envelope ready to be embedded in an E2EE message body.
 *
 * Web platform: reads via fetch + arrayBuffer (no expo-file-system).
 * Native: reads via FileSystem.readAsStringAsync(base64).
 */
export async function uploadEncryptedMedia(args: {
  uri: string;
  mediaType: "image" | "video" | "audio";
  token: string;
  apiBaseUrl: string;
  ext?: string;
  /**
   * Caller-supplied 32-byte key instead of a freshly generated one. Used by
   * Stories, where one key is shared across the media blob AND wrapped
   * per-viewer separately (see statusCrypto.ts) — a chat message, by
   * contrast, always generates its own single-use key here.
   */
  mediaKey?: Uint8Array;
}): Promise<UploadResult> {
  const { uri, mediaType, token, apiBaseUrl, ext } = args;

  // 1. Read plaintext bytes.
  const plaintext = await readFileBytes(uri);
  if (plaintext.length === 0) {
    throw new Error("Cannot send empty media");
  }
  if (plaintext.length > MAX_FILE_SIZE) {
    throw new Error(`File is ${plaintext.length} bytes; max is ${MAX_FILE_SIZE}`);
  }

  // 2. Encrypt.
  const mediaKey = args.mediaKey ?? generateMediaKey();
  const { ciphertext } = encryptMedia(plaintext, mediaKey);

  // 3. Get signed PUT URL.
  const uploadUrlRes = await fetch(new URL("/api/objects/upload", apiBaseUrl).toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (!uploadUrlRes.ok) throw new Error("Failed to get upload URL");
  const { uploadURL } = (await uploadUrlRes.json()) as { uploadURL: string };

  // 4. Upload the ciphertext. Use application/octet-stream — the body is
  // opaque to GCS / the server; the SCM1 magic identifies it on download.
  const putRes = await fetch(uploadURL, {
    method: "PUT",
    headers: { "Content-Type": "application/octet-stream" },
    body: ciphertext as BodyInit,
  });
  if (!putRes.ok) {
    throw new Error(`Ciphertext upload failed (${putRes.status})`);
  }

  // 5. Register the object so it gets a stable objectPath. ACL stays "public"
  // because actual access control is the encryption itself — the new
  // /api/media/encrypted/<path> endpoint is a defense-in-depth privacy gate,
  // not the primary access control.
  const mediaUrlOnly = uploadURL.split("?")[0];
  const aclRes = await fetch(new URL("/api/objects/media", apiBaseUrl).toString(), {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ mediaURL: mediaUrlOnly }),
  });
  if (!aclRes.ok) throw new Error("Failed to register encrypted object");
  const { objectPath } = (await aclRes.json()) as { objectPath: string };

  const envelope: MediaEnvelope = {
    v: 1,
    mk: naclUtil.encodeBase64(mediaKey),
    path: objectPath,
    mt: mediaType,
    size: plaintext.length,
    ext,
  };

  return { envelope, size: plaintext.length };
}

// ─── Download ────────────────────────────────────────────────────────────────

/**
 * Fetch + decrypt a media envelope, returning a local file URI suitable for
 * <Image source={{uri}}> / video / audio playback.
 *
 * Caches under FileSystem.cacheDirectory/decrypted-media/. Caller is
 * responsible for memoizing the result inside its screen lifecycle so we
 * don't re-decrypt on every render; this helper itself does NOT memoize
 * because it has no notion of message identity.
 */
export async function fetchAndDecryptEncryptedMedia(args: {
  envelope: MediaEnvelope;
  token: string;
  apiBaseUrl: string;
  /** Stable id used in the cache filename (typically the messageId). */
  cacheKey: string;
}): Promise<string> {
  const { envelope, token, apiBaseUrl, cacheKey } = args;

  // Ciphertext fetch through the rate-limited authenticated endpoint.
  // envelope.path is like "/objects/uploads/<uuid>"; we prepend
  // /api/media/encrypted and let the server splat-capture handle the rest.
  const url = new URL(`/api/media/encrypted${envelope.path}`, apiBaseUrl).toString();
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Encrypted media fetch failed (${res.status})`);
  }
  const cipherBuf = new Uint8Array(await res.arrayBuffer());

  // Decrypt.
  const mediaKey = naclUtil.decodeBase64(envelope.mk);
  if (mediaKey.length !== 32) throw new Error("Bad mediaKey length in envelope");
  const plaintext = decryptMedia(cipherBuf, mediaKey);

  // Write to cache.
  return writeCacheFile(cacheKey, envelope, plaintext);
}

// ─── I/O helpers ─────────────────────────────────────────────────────────────

async function readFileBytes(uri: string): Promise<Uint8Array> {
  if (Platform.OS === "web") {
    const res = await fetch(uri);
    if (!res.ok) throw new Error(`Failed to read web file: ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }
  const b64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return naclUtil.decodeBase64(b64);
}

async function writeCacheFile(
  cacheKey: string,
  envelope: MediaEnvelope,
  plaintext: Uint8Array,
): Promise<string> {
  if (Platform.OS === "web") {
    // On web we can't write to a stable filesystem URI; return a blob: URL.
    // Caller must revoke the URL when no longer needed (handled at ConversationScreen).
    const mime =
      envelope.mt === "image"
        ? "image/jpeg"
        : envelope.mt === "video"
        ? "video/mp4"
        : "audio/mp4";
    const blob = new Blob([plaintext as BlobPart], { type: mime });
    return URL.createObjectURL(blob);
  }

  const dir = `${FileSystem.cacheDirectory}${CACHE_SUBDIR}/`;
  try {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  } catch {
    // Directory already exists — ignore.
  }
  const ext = envelope.ext || (envelope.mt === "image" ? "jpg" : envelope.mt === "video" ? "mp4" : "m4a");
  const path = `${dir}${cacheKey}.${ext}`;
  // Don't re-write if a fresh copy already exists.
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (info.exists && (info as any).size === plaintext.length) {
      return path;
    }
  } catch {
    // Not in cache — fall through to write.
  }
  await FileSystem.writeAsStringAsync(path, naclUtil.encodeBase64(plaintext), {
    encoding: FileSystem.EncodingType.Base64,
  });
  return path;
}

/**
 * Best-effort wipe of the decrypted-media cache.
 * Called by logout / clearAuth flows (Phase 2 build 62) so a logged-out
 * device doesn't leave decrypted media bytes lying around on disk.
 */
export async function wipeDecryptedMediaCache(): Promise<void> {
  if (Platform.OS === "web") {
    // No persistent cache on web (blob: URLs are revoked at screen unmount).
    return;
  }
  try {
    const dir = `${FileSystem.cacheDirectory}${CACHE_SUBDIR}/`;
    const info = await FileSystem.getInfoAsync(dir);
    if (info.exists) {
      await FileSystem.deleteAsync(dir, { idempotent: true });
    }
  } catch {
    // Best-effort — never throw from a wipe path.
  }
}
