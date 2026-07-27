/**
 * Shared, in-memory cache for other users' long-term X25519 identity public
 * keys, fetched via the side-effect-free /api/e2ee/identity-key/:userId
 * route (does NOT consume a one-time prekey, unlike the X3DH bundle route —
 * safe to call repeatedly). Identity keys are stable for the life of a
 * device install, so callers on any hot path (location ticks, story posts)
 * should go through this cache rather than hit the network every time.
 */

import naclUtil from "tweetnacl-util";
import { getStoredToken, getApiUrl } from "@/lib/api-utils";

const identityKeyCache = new Map<string, Uint8Array | null>();

export async function getCachedIdentityPublicKey(userId: string): Promise<Uint8Array | null> {
  if (identityKeyCache.has(userId)) return identityKeyCache.get(userId)!;
  try {
    const token = await getStoredToken();
    const baseUrl = getApiUrl();
    const res = await fetch(new URL(`/api/e2ee/identity-key/${userId}`, baseUrl), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      identityKeyCache.set(userId, null);
      return null;
    }
    const { identityPublicKey } = await res.json();
    const key = typeof identityPublicKey === "string" ? naclUtil.decodeBase64(identityPublicKey) : null;
    identityKeyCache.set(userId, key);
    return key;
  } catch {
    return null;
  }
}
