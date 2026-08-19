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
  // "ok": both keys present and cached. "no_keys": server confirmed (404)
  // the peer has no device on file — a real, stable answer, not a glitch.
  // "error": the lookup itself failed (offline, 5xx, timeout) — tells the
  // caller nothing conclusive about the peer either way.
  status: "ok" | "no_keys" | "error";
}

const identityKeyCache = new Map<string, CachedIdentityKeys>();
// De-dupes concurrent callers (e.g. computeSafetyNumber awaiting both the
// identity and signing key "separately" via Promise.all) onto a single
// in-flight network request instead of firing two identical fetches.
const inFlight = new Map<string, Promise<CachedIdentityKeys>>();

async function fetchIdentityKeys(userId: string): Promise<CachedIdentityKeys> {
  if (identityKeyCache.has(userId)) return identityKeyCache.get(userId)!;
  const existing = inFlight.get(userId);
  if (existing) return existing;

  const promise = (async (): Promise<CachedIdentityKeys> => {
    const errorResult: CachedIdentityKeys = { identityPublicKey: null, signingPublicKey: null, status: "error" };
    try {
      const token = await getStoredToken();
      const baseUrl = getApiUrl();
      const res = await fetch(new URL(`/api/e2ee/identity-key/${userId}`, baseUrl), {
        headers: { Authorization: `Bearer ${token}` },
      });
      // A failed fetch (non-2xx — e.g. a transient server error) is never
      // cached. This used to cache the empty result here unconditionally,
      // which meant one bad response (a deploy in progress, a network
      // blip) permanently poisoned this user's entry for the rest of the
      // app session: every later call, including the user tapping "Retry"
      // on the safety-number screen, hit that cached emptiness from memory
      // and never touched the network again until the app was force-quit.
      if (!res.ok) {
        // 404 specifically means the server looked and found no device —
        // that's a real, stable answer worth distinguishing from "we
        // couldn't even ask" so the UI can say the honest thing.
        return res.status === 404
          ? { identityPublicKey: null, signingPublicKey: null, status: "no_keys" }
          : errorResult;
      }
      const { identityPublicKey, signingPublicKey } = await res.json();
      const result: CachedIdentityKeys = {
        identityPublicKey: typeof identityPublicKey === "string" ? naclUtil.decodeBase64(identityPublicKey) : null,
        signingPublicKey: typeof signingPublicKey === "string" ? naclUtil.decodeBase64(signingPublicKey) : null,
        status: "ok",
      };
      // Only cache a genuinely complete answer. Anything partial (missing
      // signing key, missing identity key, or both) means the peer's
      // device row is incomplete — treat it like "no keys" rather than
      // caching a half-answer that can never resolve on retry.
      if (!result.identityPublicKey || !result.signingPublicKey) {
        return { identityPublicKey: null, signingPublicKey: null, status: "no_keys" };
      }
      identityKeyCache.set(userId, result);
      return result;
    } catch {
      return errorResult;
    } finally {
      inFlight.delete(userId);
    }
  })();

  inFlight.set(userId, promise);
  return promise;
}

export async function getCachedIdentityPublicKey(userId: string): Promise<Uint8Array | null> {
  return (await fetchIdentityKeys(userId)).identityPublicKey;
}

export async function getCachedSigningPublicKey(userId: string): Promise<Uint8Array | null> {
  return (await fetchIdentityKeys(userId)).signingPublicKey;
}

/** Peer key lookup with the failure reason preserved — used where the
 * caller needs to tell "peer genuinely has no keys" apart from "the
 * lookup failed," e.g. the safety-number screen's error copy. */
export async function getPeerIdentityKeys(userId: string): Promise<CachedIdentityKeys> {
  return fetchIdentityKeys(userId);
}
