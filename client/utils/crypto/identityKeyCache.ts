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
    if (!res.ok) {
      identityKeyCache.set(userId, empty);
      return empty;
    }
    const { identityPublicKey, signingPublicKey } = await res.json();
    const result: CachedIdentityKeys = {
      identityPublicKey: typeof identityPublicKey === "string" ? naclUtil.decodeBase64(identityPublicKey) : null,
      signingPublicKey: typeof signingPublicKey === "string" ? naclUtil.decodeBase64(signingPublicKey) : null,
    };
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
