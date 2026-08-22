// Phase C.3 — media-frame E2EE key derivation for calls.
// Phase C.4 — authenticate the exchange against each side's long-term
// identity (closes an unauthenticated-DH gap — see negotiateCallKey).
//
// Each side generates a fresh X25519 keypair when the call screen mounts,
// posts its public key to the server via `POST /api/calls/:id/e2ee-key`,
// pulls the peer's public key via `GET /api/calls/:id/e2ee-key`, and
// derives a 32-byte shared secret with `nacl.scalarMult`. That secret is
// fed through HKDF (with the callId as salt and a domain-separation tag
// as info) to produce a per-call LiveKit frame-encryption key.
//
// The server stores only the public halves; it cannot derive the shared
// secret because it never holds the private scalars. Even with a full
// server compromise, an attacker can read signaling but not call media.
//
// That said, an unauthenticated ECDH exchange like the one above is still
// vulnerable to a MITM if the party relaying the public keys is malicious:
// a compromised server could substitute its own X25519 public key for the
// real peer's on the way through, derive a shared secret with each side
// separately, and decrypt/re-encrypt frames in the middle. To close that
// gap, each side also signs its ephemeral public key with its long-term
// Ed25519 identity signing key (the same one that signs X3DH's signed
// prekey for messages) and the receiving side verifies that signature
// against the peer's already-established signing identity before deriving
// anything. A server substituting keys would need to forge that signature,
// which it cannot do without the peer's private signing key.

import nacl from "tweetnacl";
import naclUtil from "tweetnacl-util";
import { ensureSigningKeyPair, getIdentityKeyPair } from "@/utils/crypto/prekeyManager";
import { getCachedSigningPublicKey, getCachedIdentityPublicKey } from "@/utils/crypto/identityKeyCache";

export interface CallKeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
  publicKeyB64: string;
}

export function generateCallKeyPair(): CallKeyPair {
  const kp = nacl.box.keyPair();
  return {
    publicKey: kp.publicKey,
    secretKey: kp.secretKey,
    publicKeyB64: naclUtil.encodeBase64(kp.publicKey),
  };
}

export function decodePublicKey(b64: string): Uint8Array {
  return naclUtil.decodeBase64(b64);
}

// HKDF-SHA256 in JS — small, no deps. The shared secret is 32 bytes
// (X25519 output), which is already high-entropy, but we still HKDF it
// to (a) domain-separate this key from any other use of the secret, and
// (b) bind it to the callId so the same peer-pair across two calls
// derives different LiveKit keys.
async function hmacSha256(
  key: Uint8Array,
  data: Uint8Array,
): Promise<Uint8Array> {
  // RN crypto.subtle is unavailable in Expo Go / Hermes. We use
  // SubtleCrypto's HMAC-SHA-256 when available (web, dev preview) and
  // fall back to the pure-JS HMAC-SHA-256 below on native.
  if (
    typeof globalThis.crypto !== "undefined" &&
    (globalThis.crypto as any).subtle?.importKey
  ) {
    const subtle = (globalThis.crypto as any).subtle;
    const k = await subtle.importKey(
      "raw",
      key,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await subtle.sign("HMAC", k, data);
    return new Uint8Array(sig);
  }
  // Pure-JS HMAC-SHA-256 fallback (RN environment).
  return hmacSha256Pure(key, data);
}

// --- Pure JS SHA-256 + HMAC fallback (RN Hermes has no SubtleCrypto). ---
// Adapted from public-domain RFC 6234 reference.
function sha256(msg: Uint8Array): Uint8Array {
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
    0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
    0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
    0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
    0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);
  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
    0x1f83d9ab, 0x5be0cd19,
  ]);
  const bitLen = msg.length * 8;
  // Pre-processing.
  const withPad = new Uint8Array(((msg.length + 9 + 63) >> 6) << 6);
  withPad.set(msg);
  withPad[msg.length] = 0x80;
  // 64-bit big-endian length at the end.
  const dv = new DataView(withPad.buffer);
  dv.setUint32(withPad.length - 4, bitLen >>> 0, false);
  dv.setUint32(withPad.length - 8, Math.floor(bitLen / 0x100000000), false);

  const W = new Uint32Array(64);
  for (let i = 0; i < withPad.length; i += 64) {
    for (let t = 0; t < 16; t++) W[t] = dv.getUint32(i + t * 4, false);
    for (let t = 16; t < 64; t++) {
      const s0 =
        rotr(W[t - 15], 7) ^ rotr(W[t - 15], 18) ^ (W[t - 15] >>> 3);
      const s1 =
        rotr(W[t - 2], 17) ^ rotr(W[t - 2], 19) ^ (W[t - 2] >>> 10);
      W[t] = (W[t - 16] + s0 + W[t - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[t] + W[t]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const mj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + mj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0;
    H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0;
    H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0;
    H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0;
    H[7] = (H[7] + h) >>> 0;
  }
  const out = new Uint8Array(32);
  const ov = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) ov.setUint32(i * 4, H[i], false);
  return out;
}

function rotr(x: number, n: number): number {
  return ((x >>> n) | (x << (32 - n))) >>> 0;
}

function hmacSha256Pure(key: Uint8Array, data: Uint8Array): Uint8Array {
  let k = key;
  if (k.length > 64) k = sha256(k);
  const kPad = new Uint8Array(64);
  kPad.set(k);
  const oKey = new Uint8Array(64);
  const iKey = new Uint8Array(64);
  for (let i = 0; i < 64; i++) {
    oKey[i] = kPad[i] ^ 0x5c;
    iKey[i] = kPad[i] ^ 0x36;
  }
  const inner = new Uint8Array(iKey.length + data.length);
  inner.set(iKey);
  inner.set(data, iKey.length);
  const innerHash = sha256(inner);
  const outer = new Uint8Array(oKey.length + innerHash.length);
  outer.set(oKey);
  outer.set(innerHash, oKey.length);
  return sha256(outer);
}

// HKDF-Extract + HKDF-Expand for L = 32 bytes.
async function hkdfSha256(
  ikm: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array,
): Promise<Uint8Array> {
  const prk = await hmacSha256(salt, ikm);
  // L = 32 means one block; T(1) = HMAC(PRK, info || 0x01).
  const t1Input = new Uint8Array(info.length + 1);
  t1Input.set(info);
  t1Input[info.length] = 0x01;
  return hmacSha256(prk, t1Input);
}

const INFO = new TextEncoder().encode("SecureConnect/LiveKit-Frame-v1");

export async function deriveCallKey(
  mySecretKey: Uint8Array,
  peerPublicKey: Uint8Array,
  callId: string,
  // Layer-2: a second, independent secret mixed into the same key
  // derivation — a static-static X25519 DH between both parties' *long-term*
  // identity keys (see superEncrypt.ts's deriveLayer2ConversationKey; the
  // same primitive used for messages/media). Combining it here rather than
  // encrypting frames twice keeps the cost a one-time key derivation, not a
  // second per-frame crypto pass — real-time video can't absorb that. If the
  // ephemeral exchange above were ever compromised (a bug, a future break),
  // an attacker would still need this independently-derived secret too.
  layer2Ikm?: Uint8Array,
): Promise<Uint8Array> {
  // X25519 shared secret (32 bytes).
  const shared = nacl.scalarMult(mySecretKey, peerPublicKey);
  const ikm = layer2Ikm ? concatBytes(shared, layer2Ikm) : shared;
  // Salt with the callId so the same peer-pair across two different
  // calls yields different LiveKit keys.
  const salt = new TextEncoder().encode(callId);
  return hkdfSha256(ikm, salt, INFO);
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

/** Best-effort static-static X25519 DH between both parties' long-term
 * identity keys, for mixing into deriveCallKey. Returns null (never
 * throws) if either identity key isn't available yet — the caller treats
 * that as "proceed on the ephemeral exchange alone," not a hard failure. */
async function tryDeriveCallLayer2Ikm(peerUserId: string): Promise<Uint8Array | null> {
  try {
    const myIKPair = await getIdentityKeyPair();
    if (!myIKPair) return null;
    const theirIdentityPublic = await getCachedIdentityPublicKey(peerUserId);
    if (!theirIdentityPublic) return null;
    return nacl.scalarMult(myIKPair.secretKey, theirIdentityPublic);
  } catch {
    return null;
  }
}

// End-to-end glue for the call screen: generate a keypair, post our
// public half, poll for the peer's, derive the LiveKit frame key. If the
// peer never posts (older client without C.3 support, or network
// failure), resolves to `null` — the call screens (VideoCallScreen /
// AudioCallScreen) now fail CLOSED on that: they refuse to connect the
// call at all rather than silently falling back to a transport-only
// connection, since this app promises calls are end-to-end encrypted.
//
// Timeout defaults to 10s (20 polls × 500ms) — long enough that a slow
// recipient pickup still completes the handshake, short enough that we
// don't hold the call ringing forever if the peer can't participate.
// Bumped from 8s now that a timeout here is a hard call failure (with a
// retry) instead of a silent downgrade — worth a little more margin to
// avoid failing calls that would have completed the handshake fine a
// second or two later.
export async function negotiateCallKey(opts: {
  callId: string;
  apiUrl: string;
  authToken: string;
  // The other participant's user id. When present, the peer's ephemeral
  // call pubkey MUST carry a valid signature from their long-term identity
  // signing key or the handshake fails closed (see the module doc comment
  // for why — this is what stops a compromised server from substituting
  // its own key into the exchange). Omit only when there's genuinely no
  // user identity to verify against (e.g. a sealed virtual-number call) —
  // that case keeps the pre-C.4 unauthenticated-but-still-E2E behavior.
  peerUserId?: string;
  timeoutMs?: number;
}): Promise<Uint8Array | null> {
  const { callId, apiUrl, authToken, peerUserId } = opts;
  const timeoutMs = opts.timeoutMs ?? 10000;

  try {
    const myKp = generateCallKeyPair();
    const mySigningKp = await ensureSigningKeyPair();
    const mySignatureB64 = naclUtil.encodeBase64(
      nacl.sign.detached(myKp.publicKey, mySigningKp.secretKey),
    );

    // 1. Post our public half (+ signature). Per architect review: a 4xx
    // response was previously treated as success because we only caught
    // network errors. Now we explicitly check `res.ok` and fail fast on
    // auth-class errors (401/403/404) — those are permanent for the
    // duration of this call, so further polling is wasted and the
    // transport-only fallback should be entered immediately so the caller
    // surfaces an accurate label.
    try {
      const postRes = await fetch(`${apiUrl}/api/calls/${callId}/e2ee-key`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ publicKey: myKp.publicKeyB64, signature: mySignatureB64 }),
      });
      if (!postRes.ok) {
        if (
          postRes.status === 401 ||
          postRes.status === 403 ||
          postRes.status === 404
        ) {
          console.warn(
            `[callE2EE] POST pubkey rejected (${postRes.status}) — handshake aborted, transport-only`,
          );
          return null;
        }
        // 5xx / other: continue and try polling — the GET might still
        // surface a peer key if our POST was a transient backend hiccup
        // and a retry of the underlying call later succeeds.
        console.warn(
          `[callE2EE] POST pubkey returned ${postRes.status}, attempting poll anyway`,
        );
      }
    } catch (e) {
      console.warn("[callE2EE] POST pubkey network error:", e);
    }

    // 2. Poll for the peer's pubkey.
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const res = await fetch(`${apiUrl}/api/calls/${callId}/e2ee-key`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (
          res.status === 401 ||
          res.status === 403 ||
          res.status === 404
        ) {
          console.warn(
            `[callE2EE] GET pubkey rejected (${res.status}) — handshake aborted`,
          );
          return null;
        }
        if (res.ok) {
          const body = (await res.json()) as {
            myPublicKey: string | null;
            peerPublicKey: string | null;
            peerPublicKeySig: string | null;
          };
          // Per architect review: bind derivation to the server's echo of
          // our own pubkey. If the server stored a stale/different value
          // for "my" slot (e.g. POST silently failed earlier and a prior
          // negotiation's key is still in the row), we'd derive a shared
          // secret that the peer cannot match. Require a positive echo
          // before accepting a peer key — otherwise re-POST and keep
          // polling.
          if (body.myPublicKey !== myKp.publicKeyB64) {
            try {
              await fetch(`${apiUrl}/api/calls/${callId}/e2ee-key`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${authToken}`,
                },
                body: JSON.stringify({ publicKey: myKp.publicKeyB64, signature: mySignatureB64 }),
              });
            } catch {
              // re-POST is best-effort; next poll re-checks.
            }
          } else if (body.peerPublicKey) {
            const peerPub = decodePublicKey(body.peerPublicKey);
            if (peerPub.length !== 32) {
              console.warn("[callE2EE] peer pubkey wrong length, aborting");
              return null;
            }
            // Authenticate the peer's ephemeral key against their
            // long-term identity before deriving anything from it — see
            // the module doc comment. A server relaying a substituted key
            // cannot produce a valid signature without the peer's private
            // signing key, so this is what actually stops that MITM.
            if (peerUserId) {
              const peerSigningPub = await getCachedSigningPublicKey(peerUserId);
              if (!peerSigningPub) {
                console.warn("[callE2EE] Could not fetch peer's signing identity — aborting (fail closed)");
                return null;
              }
              if (!body.peerPublicKeySig) {
                console.warn("[callE2EE] Peer call key has no signature — aborting (fail closed)");
                return null;
              }
              let sigBytes: Uint8Array;
              try {
                sigBytes = naclUtil.decodeBase64(body.peerPublicKeySig);
              } catch {
                console.warn("[callE2EE] Peer call key signature isn't valid base64 — aborting");
                return null;
              }
              if (sigBytes.length !== 64 || !nacl.sign.detached.verify(peerPub, sigBytes, peerSigningPub)) {
                console.warn("[callE2EE] Peer call key signature INVALID — possible MITM, aborting");
                return null;
              }
            }
            // Layer-2: mix in a static-static X25519 DH between both
            // parties' long-term identity keys (the same keys the
            // signature check above and Safety Number both rely on) —
            // independent of the ephemeral key exchange above. Best-effort:
            // if either identity key isn't available, the call still
            // proceeds on the ephemeral-only key rather than failing
            // closed — that key exchange is already authenticated above.
            const layer2Ikm = peerUserId ? await tryDeriveCallLayer2Ikm(peerUserId) : null;
            return await deriveCallKey(myKp.secretKey, peerPub, callId, layer2Ikm ?? undefined);
          }
        }
      } catch (e) {
        // Network blip — keep polling until timeout.
      }
      await new Promise((r) => setTimeout(r, 500));
    }

    console.log("[callE2EE] Peer pubkey not received within timeout");
    return null;
  } catch (e) {
    console.warn("[callE2EE] Key negotiation failed:", e);
    return null;
  }
}
