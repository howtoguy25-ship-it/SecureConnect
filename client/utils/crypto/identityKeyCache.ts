/**
 * Shared, in-memory cache for other users' long-term identity keys, fetched
 * via the side-effect-free /api/e2ee/identity-key/:userId route (does NOT
 * consume a one-time prekey, unlike the X3DH bundle route — safe to call
 * repeatedly). Identity keys are stable for the life of a device install,
 * so callers on any hot path (location ticks, story posts, call key
 * verification) should go through this cache rather than hit the network
 * every time.
 *
 * Returns both the X25519 identity key (used for X3DH) and the Ed25519
 * signing key (used to verify signed prekeys and, since Phase C.4, signed
 * call ephemeral keys — see client/lib/callE2EE.ts).
 */

import naclUtil from "tweetnacl-util";
import { getStoredToken, getApiUrl } from "@/lib/api-utils";

interface CachedIdentityKeys {
  identityPublicKey: Uint8Array | null;
  signingPublicKey: Uint8Array | null;
}

const identityKeyCache = new Map<string, CachedIdentityKeys>();

async function fetchIdentityKeys(userId: string): Promise<CachedIdentityKeys> {
  if (identityKeyCache.has(userId)) return identityKeyCache.get(userId)!;
  const empty: CachedIdentityKeys = { identityPublicKey: null, signingPublicKey: null };
  try {
    const token = await getStoredToken();
    const baseUrl = getApiUrl();
    const res = await fetch(new URL(`/api/e2ee/identity-key/${userId}`, baseUrl), {
      headers: { Authorization: `Bearer ${token}` },
    });
    // A failed fetch (non-2xx — e.g. a transient server error) is never
    // cached. This used to cache `empty` here unconditionally, which meant
    // one bad response (a deploy in progress, a network blip) permanently
    // poisoned this user's entry for the rest of the app session: every
    // later call, including the user tapping "Retry" on the safety-number
    // screen, hit this cached `empty` from memory and never touched the
    // network again until the app was force-quit and reopened.
    if (!res.ok) {
      return empty;
    }
    const { identityPublicKey, signingPublicKey } = await res.json();
    const result: CachedIdentityKeys = {
      identityPublicKey: typeof identityPublicKey === "string" ? naclUtil.decodeBase64(identityPublicKey) : null,
      signingPublicKey: typeof signingPublicKey === "string" ? naclUtil.decodeBase64(signingPublicKey) : null,
    };
    // Only cache a genuinely complete answer. Anything partial or empty
    // (missing signing key, missing identity key, or both) means either
    // the peer hasn't finished registering their keys yet or the server
    // hit a transient error — neither should stick around in memory and
    // block a retry from ever seeing fresh data.
    if (!result.identityPublicKey || !result.signingPublicKey) {
      return result;
    }
    identityKeyCache.set(userId, result);
    return result;
  } catch {
    return empty;
  }
}

export async function getCachedIdentityPublicKey(userId: string): Promise<Uint8Array | null> {
  return (await fetchIdentityKeys(userId)).identityPublicKey;
}

export async function getCachedSigningPublicKey(userId: string): Promise<Uint8Array | null> {
  return (await fetchIdentityKeys(userId)).signingPublicKey;
}
