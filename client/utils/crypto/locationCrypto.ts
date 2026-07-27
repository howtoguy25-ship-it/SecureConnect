/**
 * E2EE for live location sharing (Phase 1).
 *
 * The server only ever sees/stores/relays a nacl.box (X25519 + XSalsa20-
 * Poly1305) of {lat, lng} sealed per-viewer, using each viewer's long-term
 * identity key (the same key used for X3DH session setup) and the
 * sharer's own identity key. It never has the coordinates in the clear.
 *
 * Unlike a message, a location tick has no established Double Ratchet
 * session with every viewer, so this uses a plain nacl.box per recipient
 * rather than the ratchet — simpler, and appropriate for a value that's
 * superseded every few seconds while sharing is on (no forward-secrecy
 * requirement across ticks the way there is for a conversation history).
 */

import nacl from "tweetnacl";
import naclUtil from "tweetnacl-util";
import { getIdentityKeyPair } from "./prekeyManager";
import { getCachedIdentityPublicKey } from "./identityKeyCache";
import { getStoredToken, getApiUrl } from "@/lib/api-utils";

export interface SealedLocation {
  ciphertext: string;
  nonce: string;
}

/** The users currently allowed to see my location — fetched fresh each tick so a newly-approved friend starts receiving updates immediately. */
export async function fetchApprovedFriendIds(): Promise<string[]> {
  try {
    const token = await getStoredToken();
    const baseUrl = getApiUrl();
    const res = await fetch(new URL("/api/location/approved-friend-ids", baseUrl), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    const { ids } = await res.json();
    return Array.isArray(ids) ? ids : [];
  } catch {
    return [];
  }
}

/**
 * Encrypts {lat, lng} once per currently-approved friend. Friends whose
 * identity key can't be fetched (e.g. they've never opened the app / set
 * up E2EE) are silently skipped for this tick rather than failing the
 * whole update — same tick a few seconds later will retry.
 */
export async function encryptLocationForFriends(
  friendUserIds: string[],
  latitude: number,
  longitude: number,
): Promise<Record<string, SealedLocation>> {
  const me = await getIdentityKeyPair();
  if (!me) return {};

  const plaintext = naclUtil.decodeUTF8(JSON.stringify({ lat: latitude, lng: longitude }));
  const result: Record<string, SealedLocation> = {};

  await Promise.all(friendUserIds.map(async (friendId) => {
    const theirPublic = await getCachedIdentityPublicKey(friendId);
    if (!theirPublic) return;
    const nonce = nacl.randomBytes(24);
    const ciphertext = nacl.box(plaintext, nonce, theirPublic, me.secretKey);
    result[friendId] = {
      ciphertext: naclUtil.encodeBase64(ciphertext),
      nonce: naclUtil.encodeBase64(nonce),
    };
  }));

  return result;
}

/** Decrypts a sealed location update from a specific friend. Null on any failure. */
export async function decryptLocationFromFriend(
  friendUserId: string,
  ciphertext: string,
  nonce: string,
): Promise<{ latitude: number; longitude: number } | null> {
  const me = await getIdentityKeyPair();
  if (!me) return null;
  const theirPublic = await getCachedIdentityPublicKey(friendUserId);
  if (!theirPublic) return null;

  try {
    const opened = nacl.box.open(
      naclUtil.decodeBase64(ciphertext),
      naclUtil.decodeBase64(nonce),
      theirPublic,
      me.secretKey,
    );
    if (!opened) return null;
    const parsed = JSON.parse(naclUtil.encodeUTF8(opened));
    if (typeof parsed?.lat !== "number" || typeof parsed?.lng !== "number") return null;
    return { latitude: parsed.lat, longitude: parsed.lng };
  } catch {
    return null;
  }
}
