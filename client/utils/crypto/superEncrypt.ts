/**
 * Layer-2 encryption — an independent outer wrap applied on top of the
 * already-fully-encrypted payload: the Double Ratchet ciphertext for
 * messages, the SCM1 ciphertext for media/images, and (via a different
 * entry point) mixed into the call frame key for calls.
 *
 * Deliberately NOT part of the Double Ratchet / X3DH state machine. This
 * derives its key from a static-static X25519 DH between both parties'
 * long-term identity keys — the SAME identity keys a Safety Number
 * verifies — completely independent of the ratchet's own evolving chain
 * keys and of any per-message/per-file key. A hypothetical bug or future
 * break in the ratchet's key schedule, or in a single message/file key,
 * does not hand over this layer's key, and vice versa: reading the
 * content requires breaking BOTH independently-keyed layers, not just one.
 *
 * Because it's derived purely from static identity keys + the two user
 * ids, both sides compute the identical key with no handshake or extra
 * round trip — it's available offline, synchronously, the moment both
 * identity keys are known.
 */
import nacl from "tweetnacl";
import { hkdf } from "./hkdf";

const CONVO_INFO = new TextEncoder().encode("Pryvo-Layer2-Convo-v1");
const WRAP_INFO = new TextEncoder().encode("Pryvo-Layer2-Wrap-v1");
// "PL2\0" — distinguishes a layer-2-wrapped payload from a bare inner
// ciphertext so decrypt paths can detect and skip unwrapping for content
// sent before this layer existed (backward compatibility during rollout).
const MAGIC = new Uint8Array([0x50, 0x4c, 0x32, 0x00]);
const NONCE_LEN = 24; // nacl.secretbox.nonceLength

/**
 * Static-static X25519 DH between both parties' long-term identity keys,
 * HKDF'd with the sorted user-id pair as salt so both sides derive the
 * identical key regardless of who's "mine" locally.
 */
export function deriveLayer2ConversationKey(
  myIdentitySecret: Uint8Array,
  theirIdentityPublic: Uint8Array,
  myUserId: string,
  theirUserId: string,
): Uint8Array {
  const shared = nacl.scalarMult(myIdentitySecret, theirIdentityPublic);
  const salt = new TextEncoder().encode([myUserId, theirUserId].sort().join(":"));
  return hkdf(shared, salt, CONVO_INFO, 32);
}

/**
 * Wraps `plaintext` (the already-encrypted inner ciphertext) in a second,
 * independently-keyed secretbox layer. A fresh per-call message key is
 * derived from the conversation key + a random nonce, so no key is ever
 * reused across wraps even though the conversation key itself is static.
 *
 * Output: MAGIC(4) || nonce(24) || secretbox_ciphertext
 */
export function layer2Wrap(plaintext: Uint8Array, conversationKey: Uint8Array): Uint8Array {
  const nonce = nacl.randomBytes(NONCE_LEN);
  const msgKey = hkdf(conversationKey, nonce, WRAP_INFO, 32);
  const ct = nacl.secretbox(plaintext, nonce, msgKey);
  const out = new Uint8Array(MAGIC.length + NONCE_LEN + ct.length);
  out.set(MAGIC, 0);
  out.set(nonce, MAGIC.length);
  out.set(ct, MAGIC.length + NONCE_LEN);
  return out;
}

/**
 * Reverses layer2Wrap. Returns null on any failure — wrong key, tampered
 * ciphertext, or input that was never layer-2-wrapped in the first place
 * (too short / bad magic), which callers should treat as "not wrapped,
 * nothing to unwrap" for backward compatibility with pre-layer-2 payloads.
 */
export function layer2Unwrap(wrapped: Uint8Array, conversationKey: Uint8Array): Uint8Array | null {
  if (wrapped.length < MAGIC.length + NONCE_LEN) return null;
  for (let i = 0; i < MAGIC.length; i++) {
    if (wrapped[i] !== MAGIC[i]) return null;
  }
  const nonce = wrapped.slice(MAGIC.length, MAGIC.length + NONCE_LEN);
  const ct = wrapped.slice(MAGIC.length + NONCE_LEN);
  const msgKey = hkdf(conversationKey, nonce, WRAP_INFO, 32);
  return nacl.secretbox.open(ct, nonce, msgKey);
}
