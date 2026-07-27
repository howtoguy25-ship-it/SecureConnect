/**
 * E2EE for Status/Stories (Phase 1) — closed-audience privacy modes only.
 *
 * A story with an unbounded audience ('everyone' — any user on the
 * platform, per storage.ts _canViewerSeeStatusSync) has no fixed recipient
 * set, so there is nothing to encrypt to; those stay on the plaintext path
 * (see isEncrypted in shared/schema.ts). For the three closed-audience
 * modes ('contacts' / 'except' / 'only', further narrowed by a per-post
 * 'friends'/'custom' override), the eligible-viewer set at post time IS
 * well-defined, so we do real fan-out encryption:
 *
 *   1. Generate one random 32-byte mediaKey for the story.
 *   2. Encrypt the media file with it (the same SCM1 chunked format chat
 *      attachments use — see uploadEncryptedMedia).
 *   3. Encrypt the caption with it too (nacl.secretbox).
 *   4. Wrap the mediaKey once per eligible viewer (nacl.box, sealed to
 *      that viewer's identity public key) — including the poster
 *      themselves, so they can re-view their own story after an app
 *      restart without the plaintext key still being in memory.
 *
 * The eligible-viewer computation here is a client-side *approximation* of
 * storage.ts's _canViewerSeeStatusSync (mirroring the poster's current
 * storyPrivacyMode + exceptIds/onlyIds + any per-post override), used only
 * to decide who gets a wrapped key. It is NOT the security boundary —
 * the server still independently gates who can even see a status exists
 * at read time. Under- or over-inclusion here only affects whether a
 * viewer who's otherwise allowed can successfully decrypt (a UX bug, not
 * a confidentiality issue): a wrap generated for someone the server later
 * refuses to show the row to is simply never fetched by them.
 */

import nacl from "tweetnacl";
import naclUtil from "tweetnacl-util";
import { getIdentityKeyPair } from "./prekeyManager";
import { getCachedIdentityPublicKey } from "./identityKeyCache";
import { generateMediaKey } from "./mediaEncryption";
import { getStoredToken, getApiUrl } from "@/lib/api-utils";

export interface MediaKeyWrap {
  wrappedKey: string;
  nonce: string;
}

export interface EncryptedStoryFields {
  isEncrypted: true;
  encryptedCaption: string | null;
  captionNonce: string | null;
  mediaKeyWraps: Record<string, MediaKeyWrap>;
  /** The raw key — pass to uploadEncryptedMedia({ mediaKey }), never sent to the server directly. */
  mediaKey: Uint8Array;
}

async function fetchMutualFriendIds(): Promise<string[]> {
  try {
    const token = await getStoredToken();
    const baseUrl = getApiUrl();
    const res = await fetch(new URL("/api/friends", baseUrl), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    const friends = await res.json();
    return Array.isArray(friends) ? friends.map((f: any) => f.id).filter(Boolean) : [];
  } catch {
    return [];
  }
}

/**
 * Mirrors storage.ts _canViewerSeeStatusSync: the account-level
 * storyPrivacyMode gate, ANDed with this specific post's 'friends'/'custom'
 * override (which can still narrow the audience even when the account-level
 * mode is 'everyone' — a per-post override only ever restricts, never
 * widens, matching the server's two-layer check). Returns null only when
 * NEITHER layer bounds the audience — genuinely unbounded, caller must not
 * encrypt.
 */
export async function computeEligibleViewerIds(args: {
  storyPrivacyMode: string;
  storyPrivacyExceptIds: string[];
  storyPrivacyOnlyIds: string[];
  postPrivacy: "everyone" | "friends" | "custom";
  postCustomViewers?: string[];
}): Promise<string[] | null> {
  const { storyPrivacyMode, storyPrivacyExceptIds, storyPrivacyOnlyIds, postPrivacy, postCustomViewers } = args;

  if (storyPrivacyMode === "everyone" && postPrivacy === "everyone") return null;

  let base: string[] | null;
  if (storyPrivacyMode === "everyone") {
    base = null; // account mode doesn't narrow; rely on the post-level override below
  } else if (storyPrivacyMode === "only") {
    base = storyPrivacyOnlyIds;
  } else {
    const mutualFriendIds = await fetchMutualFriendIds();
    base = storyPrivacyMode === "except"
      ? mutualFriendIds.filter((id) => !storyPrivacyExceptIds.includes(id))
      : mutualFriendIds; // 'contacts'
  }

  if (postPrivacy === "custom") {
    const custom = postCustomViewers ?? [];
    base = base === null ? custom : base.filter((id) => custom.includes(id));
  } else if (postPrivacy === "friends") {
    const mutualFriendIds = await fetchMutualFriendIds();
    base = base === null ? mutualFriendIds : base.filter((id) => mutualFriendIds.includes(id));
  }

  return Array.from(new Set(base ?? []));
}

/**
 * Encrypts a story's caption + generates the media key, wrapped for every
 * eligible viewer (plus the poster). Viewers whose identity key can't be
 * fetched are skipped (same as a friend who's never set up E2EE) — they
 * simply won't be able to decrypt this particular story.
 */
export async function encryptStoryForViewers(
  caption: string | null,
  eligibleViewerIds: string[],
  posterUserId: string,
): Promise<EncryptedStoryFields | null> {
  const me = await getIdentityKeyPair();
  if (!me) return null;

  const mediaKey = generateMediaKey();

  let encryptedCaption: string | null = null;
  let captionNonce: string | null = null;
  if (caption) {
    const nonce = nacl.randomBytes(24);
    const box = nacl.secretbox(naclUtil.decodeUTF8(caption), nonce, mediaKey);
    encryptedCaption = naclUtil.encodeBase64(box);
    captionNonce = naclUtil.encodeBase64(nonce);
  }

  const wraps: Record<string, MediaKeyWrap> = {};

  await Promise.all(eligibleViewerIds.map(async (viewerId) => {
    const theirPublic = await getCachedIdentityPublicKey(viewerId);
    if (!theirPublic) return;
    const nonce = nacl.randomBytes(24);
    const wrapped = nacl.box(mediaKey, nonce, theirPublic, me.secretKey);
    wraps[viewerId] = { wrappedKey: naclUtil.encodeBase64(wrapped), nonce: naclUtil.encodeBase64(nonce) };
  }));

  // Always include the poster too (keyed by their own real userId, same
  // as any other viewer), so they can decrypt their own story later —
  // e.g. re-opening "My Status" after an app restart, once the plaintext
  // key is no longer sitting in memory. Boxing to your own public key
  // with your own secret key is valid — ECDH with yourself derives a
  // stable shared secret from your own keypair.
  {
    const nonce = nacl.randomBytes(24);
    const wrapped = nacl.box(mediaKey, nonce, me.publicKey, me.secretKey);
    wraps[posterUserId] = { wrappedKey: naclUtil.encodeBase64(wrapped), nonce: naclUtil.encodeBase64(nonce) };
  }

  return {
    isEncrypted: true,
    encryptedCaption,
    captionNonce,
    mediaKeyWraps: wraps,
    mediaKey,
  };
}

/**
 * Unwraps a story's media key from my own slice of mediaKeyWraps
 * (keyed by my userId, whether I'm the poster viewing my own story or a
 * friend viewing theirs — see encryptStoryForViewers). The box was always
 * sealed with the poster's identity key, including in the self-view case
 * (a poster boxes to their own public key), so this always resolves
 * `posterUserId`'s identity key regardless of who's viewing.
 */
export async function unwrapStoryMediaKey(
  posterUserId: string,
  wrap: MediaKeyWrap,
): Promise<Uint8Array | null> {
  const me = await getIdentityKeyPair();
  if (!me) return null;
  const theirPublic = await getCachedIdentityPublicKey(posterUserId);
  if (!theirPublic) return null;
  try {
    const opened = nacl.box.open(
      naclUtil.decodeBase64(wrap.wrappedKey),
      naclUtil.decodeBase64(wrap.nonce),
      theirPublic,
      me.secretKey,
    );
    return opened && opened.length === 32 ? opened : null;
  } catch {
    return null;
  }
}

/** Decrypts a story caption once the media key has been unwrapped. Null on any failure. */
export function decryptStoryCaption(
  encryptedCaption: string,
  captionNonce: string,
  mediaKey: Uint8Array,
): string | null {
  try {
    const opened = nacl.secretbox.open(
      naclUtil.decodeBase64(encryptedCaption),
      naclUtil.decodeBase64(captionNonce),
      mediaKey,
    );
    return opened ? naclUtil.encodeUTF8(opened) : null;
  } catch {
    return null;
  }
}
