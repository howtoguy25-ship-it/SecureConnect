/**
 * Safety-number verification (Phase C.5) — a Signal-style manual check that
 * lets two people confirm they're really talking to each other, closing the
 * one gap automated crypto can't close on its own: trust-on-first-use.
 *
 * Every other layer in this app (X3DH, Double Ratchet, the signed call-key
 * exchange in callE2EE.ts) verifies that messages/calls are consistent with
 * *some* long-term identity key on file for a user. None of them can prove
 * that key was never swapped by a compromised server at the moment the
 * account first registered, or during a server-side account takeover later
 * — an automated check has no independent channel to compare against. A
 * safety number gives people that channel: two people who can compare a
 * number out-of-band (in person, by phone, by a channel they already trust)
 * can catch a substituted identity key that no code running on either
 * device could detect on its own.
 *
 * The number is derived from BOTH of a user's long-term public keys — the
 * X25519 identity key (used for X3DH) and the Ed25519 signing key (used to
 * sign prekeys and, since Phase C.4, ephemeral call keys) — so verifying it
 * once vouches for both the messaging and the calling trust anchor at the
 * same time. Deterministic and symmetric: sorted by user id so both sides
 * compute the exact same digits regardless of who opens the screen first.
 */

import nacl from "tweetnacl";
import { getIdentityKeyPair, getSigningKeyPair } from "./prekeyManager";
import { getPeerIdentityKeys } from "./identityKeyCache";

export interface SafetyNumberResult {
  ok: true;
  // 60 digits, formatted as 12 space-separated groups of 5 — long enough
  // that a coincidental collision between two different key-pairs is
  // vanishingly unlikely, short enough to read aloud or compare by eye.
  formatted: string;
  // A short hash of `formatted`, stored alongside a contact's "verified"
  // flag. If either party's identity or signing key ever changes (device
  // reinstall, account compromise, a genuine key rotation), the number
  // changes and this hash no longer matches — so verification status
  // resets automatically instead of staying stuck on stale trust.
  digestId: string;
}

// Distinguishes WHY the number couldn't be computed so the screen can show
// an honest, specific message instead of one generic guess that's wrong
// two times out of three:
//  - "my_keys_missing": this device's own identity/signing keys aren't in
//    SecureStore yet — vanishingly rare outside a fresh install mid-setup.
//  - "peer_no_keys": the server has no device on file for the peer at all
//    (they've genuinely never finished E2EE setup).
//  - "network_error": the peer lookup itself failed (offline, server
//    error, timeout) — nothing conclusive about the peer either way.
export type SafetyNumberFailureReason = "my_keys_missing" | "peer_no_keys" | "network_error";

export interface SafetyNumberFailure {
  ok: false;
  reason: SafetyNumberFailureReason;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

function userBlock(userId: string, identityPub: Uint8Array, signingPub: Uint8Array): Uint8Array {
  const idBytes = new TextEncoder().encode(userId);
  const lenPrefix = new Uint8Array(4);
  new DataView(lenPrefix.buffer).setUint32(0, idBytes.length, false);
  // Length-prefix the user id so two different (userId, key) pairings can
  // never be re-chunked into an ambiguous byte stream that hashes the same.
  return concatBytes(lenPrefix, idBytes, identityPub, signingPub);
}

function bytesToDigitGroups(digest: Uint8Array): string {
  // nacl.hash is SHA-512 (64 bytes) — use 60 of those bytes as twelve
  // 5-byte chunks, each reduced mod 100000 into a zero-padded 5-digit
  // group. Hash avalanche means any single-bit difference in either
  // party's keys produces a completely different set of digits, so a
  // mismatch is never subtle.
  const groups: string[] = [];
  for (let i = 0; i < 12; i++) {
    const chunk = digest.slice(i * 5, i * 5 + 5);
    let n = 0;
    for (let b = 0; b < chunk.length; b++) {
      n = (n * 256 + chunk[b]) % 100000;
    }
    groups.push(n.toString().padStart(5, "0"));
  }
  return groups.join(" ");
}

export async function computeSafetyNumber(
  myUserId: string,
  peerUserId: string,
): Promise<SafetyNumberResult | SafetyNumberFailure> {
  const [myIdentity, mySigning] = await Promise.all([getIdentityKeyPair(), getSigningKeyPair()]);
  if (!myIdentity || !mySigning) return { ok: false, reason: "my_keys_missing" };

  const peer = await getPeerIdentityKeys(peerUserId);
  if (!peer.identityPublicKey || !peer.signingPublicKey) {
    return { ok: false, reason: peer.status === "no_keys" ? "peer_no_keys" : "network_error" };
  }
  const { identityPublicKey: peerIdentity, signingPublicKey: peerSigning } = peer;

  const mine = userBlock(myUserId, myIdentity.publicKey, mySigning.publicKey);
  const theirs = userBlock(peerUserId, peerIdentity, peerSigning);
  // Sort so both participants build the identical byte stream regardless
  // of which side is "mine" vs "theirs" locally.
  const [first, second] = myUserId < peerUserId ? [mine, theirs] : [theirs, mine];

  const digest = nacl.hash(concatBytes(first, second));
  const formatted = bytesToDigitGroups(digest);

  // digestId: a short, cheap fingerprint of the full number for the
  // verified-flag storage key — doesn't need to be cryptographically
  // strong, just needs to change whenever `formatted` does.
  const digestId = Array.from(digest.slice(0, 8))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return { ok: true, formatted, digestId };
}
