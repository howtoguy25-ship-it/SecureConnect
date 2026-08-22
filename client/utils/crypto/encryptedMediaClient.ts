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
import { getIdentityKeyPair } from "./prekeyManager";
import { getCachedIdentityPublicKey } from "./identityKeyCache";
import { deriveLayer2ConversationKey, layer2Wrap, layer2Unwrap } from "./superEncrypt";

export { MAX_FILE_SIZE };

// Feature flag — flip to false to disable the new encrypted path at runtime
// without removing it from the bundle (so QA can A/B the two flows).
export const E2EE_MEDIA_ENABLED = true;

// Envelope marker — recipients detect this prefix in the decrypted message
// text to know the bubble is an encrypted media reference. Distinct from the
// v1.0.6 `__SC_CONTACT_V1__` prefix so the two flows never collide.
export const MEDIA_ENVELOPE_PREFIX = "__SC_MEDIA_V1__";

const CACHE_SUBDIR = "decrypted-media";

// None of the three network calls in uploadEncryptedMedia had a timeout —
// a hung request (e.g. GCS PUT stalling on a flaky connection) would leave
// the promise pending forever: no error, no thrown exception, just a send
// that silently never completes. That's indistinguishable from "nothing
// happened" from the user's side. Timeouts are generous (large media
// legitimately takes a while to upload) but guarantee the send eventually
// either succeeds or surfaces a real, catchable error instead of hanging.
async function fetchWithUploadTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Upload timed out. Please check your connection and try again.");
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export interface MediaEnvelope {
  // 1 = SCM1 ciphertext uploaded as-is. 2 = the object at `path` is ALSO
  // wrapped in a second, independently-keyed layer-2 secretbox (see
  // superEncrypt.ts) on top of the SCM1 ciphertext — the extra encryption
  // layer applied to actual file bytes, not just the key-delivery envelope
  // (which already rides inside the layer-2-wrapped message text). Both
  // versions decrypt fine; v2 just needs one extra unwrap step first.
  v: 1 | 2;
  /** Base64 mediaKey (32 bytes). Must never leave the encrypted message body. */
  mk: string;
  /** Server-relative object path, e.g. "/objects/uploads/<uuid>" */
  path: string;
  /** "image" | "video" | "audio" | "file" — matches existing mediaType column values */
  mt: "image" | "video" | "audio" | "file";
  /** Plaintext size in bytes (for UI / sanity check before download). */
  size: number;
  /** Optional file extension hint for the local cache file. */
  ext?: string;
  /** Original filename — "file" kind only, used to render the bubble and to
   * name the saved copy when the recipient opens/exports it. */
  name?: string;
  /** "audio" kind only — real amplitude bars captured from the recorder's
   * actual metering while recording (0-1 normalized, fixed-length array).
   * Travels inside the E2EE envelope like everything else here, so both
   * sender and recipient render the true waveform, not a placeholder. */
  wf?: number[];
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
    if (parsed?.v !== 1 && parsed?.v !== 2) return null;
    if (typeof parsed.mk !== "string" || typeof parsed.path !== "string") return null;
    if (parsed.mt !== "image" && parsed.mt !== "video" && parsed.mt !== "audio" && parsed.mt !== "file") return null;
    if (typeof parsed.size !== "number" || parsed.size < 0 || parsed.size > MAX_FILE_SIZE) {
      return null;
    }
    if (parsed.name !== undefined && typeof parsed.name !== "string") return null;
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
  mediaType: "image" | "video" | "audio" | "file";
  token: string;
  apiBaseUrl: string;
  ext?: string;
  /** Original filename — "file" kind only, carried through to the envelope. */
  name?: string;
  /** "audio" kind only — real waveform bars captured while recording. */
  waveform?: number[];
  /**
   * Caller-supplied 32-byte key instead of a freshly generated one. Used by
   * Stories, where one key is shared across the media blob AND wrapped
   * per-viewer separately (see statusCrypto.ts) — a chat message, by
   * contrast, always generates its own single-use key here.
   */
  mediaKey?: Uint8Array;
  /**
   * Both userIds of a 1:1 conversation — when both are provided AND the
   * recipient's identity key is available, the uploaded ciphertext gets a
   * second, independently-keyed layer-2 wrap on top of the normal SCM1
   * encryption (see superEncrypt.ts), and the envelope is marked v:2.
   * Omitted by callers with no single "other party" (Stories/Status,
   * which already have their own per-viewer key-wrapping scheme) — those
   * stay on the existing v:1 format, unaffected.
   */
  myUserId?: string;
  theirUserId?: string;
}): Promise<UploadResult> {
  const { uri, mediaType, token, apiBaseUrl, ext, name, waveform, myUserId, theirUserId } = args;

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
  const { ciphertext: innerCiphertext } = encryptMedia(plaintext, mediaKey);

  // 2b. Layer-2: best-effort, never blocks the send if identity keys
  // aren't available yet — the SCM1 encryption above is already full
  // client-side encryption on its own.
  let ciphertext: Uint8Array = innerCiphertext;
  let envelopeVersion: 1 | 2 = 1;
  if (myUserId && theirUserId) {
    const convoKey = await tryDeriveConvoKey(myUserId, theirUserId);
    if (convoKey) {
      ciphertext = layer2Wrap(innerCiphertext, convoKey);
      envelopeVersion = 2;
    }
  }

  // 3. Get signed PUT URL.
  const uploadUrlRes = await fetchWithUploadTimeout(new URL("/api/objects/upload", apiBaseUrl).toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  }, 15000);
  if (!uploadUrlRes.ok) throw new Error("Failed to get upload URL");
  const { uploadURL } = (await uploadUrlRes.json()) as { uploadURL: string };

  // 4. Upload the ciphertext. Use application/octet-stream — the body is
  // opaque to GCS / the server; the SCM1 magic identifies it on download.
  // 60s cap — generous for a 50MiB (MAX_FILE_SIZE) upload on a slow
  // connection, but not infinite.
  const putRes = await fetchWithUploadTimeout(uploadURL, {
    method: "PUT",
    headers: { "Content-Type": "application/octet-stream" },
    body: ciphertext as BodyInit,
  }, 60000);
  if (!putRes.ok) {
    throw new Error(`Ciphertext upload failed (${putRes.status})`);
  }

  // 5. Register the object so it gets a stable objectPath. ACL stays "public"
  // because actual access control is the encryption itself — the new
  // /api/media/encrypted/<path> endpoint is a defense-in-depth privacy gate,
  // not the primary access control.
  const mediaUrlOnly = uploadURL.split("?")[0];
  const aclRes = await fetchWithUploadTimeout(new URL("/api/objects/media", apiBaseUrl).toString(), {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ mediaURL: mediaUrlOnly }),
  }, 15000);
  if (!aclRes.ok) throw new Error("Failed to register encrypted object");
  const { objectPath } = (await aclRes.json()) as { objectPath: string };

  const envelope: MediaEnvelope = {
    v: envelopeVersion,
    mk: naclUtil.encodeBase64(mediaKey),
    path: objectPath,
    mt: mediaType,
    size: plaintext.length,
    ext,
    name,
    wf: waveform,
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
  /** Both userIds — required to unwrap a v:2 (layer-2-wrapped) envelope.
   * See uploadEncryptedMedia's matching params. */
  myUserId?: string;
  theirUserId?: string;
}): Promise<string> {
  const { envelope, token, apiBaseUrl, cacheKey, myUserId, theirUserId } = args;

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
  let cipherBuf: Uint8Array<ArrayBufferLike> = new Uint8Array(await res.arrayBuffer());

  if (envelope.v === 2) {
    if (!myUserId || !theirUserId) {
      throw new Error("Cannot unwrap layer-2 media — missing conversation identity");
    }
    const convoKey = await tryDeriveConvoKey(myUserId, theirUserId);
    if (!convoKey) {
      throw new Error("Cannot unwrap layer-2 media — peer identity key unavailable");
    }
    const unwrapped = layer2Unwrap(cipherBuf, convoKey);
    if (!unwrapped) throw new Error("Layer-2 media unwrap failed — tampered or wrong key");
    cipherBuf = unwrapped;
  }

  // Decrypt.
  const mediaKey = naclUtil.decodeBase64(envelope.mk);
  if (mediaKey.length !== 32) throw new Error("Bad mediaKey length in envelope");
  const plaintext = decryptMedia(cipherBuf, mediaKey);

  // Write to cache.
  return writeCacheFile(cacheKey, envelope, plaintext);
}

/** Shared by upload + download: derive the layer-2 conversation key from
 * both parties' identity keys, or null if either isn't available yet. */
async function tryDeriveConvoKey(myUserId: string, theirUserId: string): Promise<Uint8Array | null> {
  try {
    const myIKPair = await getIdentityKeyPair();
    if (!myIKPair) return null;
    const theirIdentityPublic = await getCachedIdentityPublicKey(theirUserId);
    if (!theirIdentityPublic) return null;
    return deriveLayer2ConversationKey(myIKPair.secretKey, theirIdentityPublic, myUserId, theirUserId);
  } catch {
    return null;
  }
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
        : envelope.mt === "audio"
        ? "audio/mp4"
        : "application/octet-stream";
    const blob = new Blob([plaintext as BlobPart], { type: mime });
    return URL.createObjectURL(blob);
  }

  const dir = `${FileSystem.cacheDirectory}${CACHE_SUBDIR}/`;
  try {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  } catch {
    // Directory already exists — ignore.
  }
  const nameExt = envelope.name?.includes(".") ? envelope.name.split(".").pop() : undefined;
  const ext = envelope.ext || nameExt || (envelope.mt === "image" ? "jpg" : envelope.mt === "video" ? "mp4" : envelope.mt === "audio" ? "m4a" : "bin");
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
