/**
 * Unit tests for client/utils/crypto/superEncrypt.ts — the Layer-2 outer
 * encryption wrap applied on top of messages, media, and (via a separate
 * entry point) call keys.
 *
 * Pure-crypto: no React Native, no SecureStore, no fetch.
 */

import nacl from "tweetnacl";
import {
  deriveLayer2ConversationKey,
  layer2Wrap,
  layer2Unwrap,
} from "../../client/utils/crypto/superEncrypt";

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

describe("deriveLayer2ConversationKey", () => {
  test("both sides derive the identical key regardless of direction", () => {
    const alice = nacl.box.keyPair();
    const bob = nacl.box.keyPair();

    const keyFromAlice = deriveLayer2ConversationKey(
      alice.secretKey,
      bob.publicKey,
      "alice-id",
      "bob-id",
    );
    const keyFromBob = deriveLayer2ConversationKey(
      bob.secretKey,
      alice.publicKey,
      "bob-id",
      "alice-id",
    );

    expect(bytesEqual(keyFromAlice, keyFromBob)).toBe(true);
    expect(keyFromAlice.length).toBe(32);
  });

  test("different peer pairs derive different keys", () => {
    const alice = nacl.box.keyPair();
    const bob = nacl.box.keyPair();
    const carol = nacl.box.keyPair();

    const aliceBob = deriveLayer2ConversationKey(alice.secretKey, bob.publicKey, "alice", "bob");
    const aliceCarol = deriveLayer2ConversationKey(alice.secretKey, carol.publicKey, "alice", "carol");

    expect(bytesEqual(aliceBob, aliceCarol)).toBe(false);
  });
});

describe("layer2Wrap / layer2Unwrap", () => {
  const conversationKey = nacl.randomBytes(32);

  test("round-trips arbitrary bytes", () => {
    const plaintext = new TextEncoder().encode("this is an inner ciphertext blob, already encrypted once");
    const wrapped = layer2Wrap(plaintext, conversationKey);
    const unwrapped = layer2Unwrap(wrapped, conversationKey);
    expect(unwrapped).not.toBeNull();
    expect(bytesEqual(unwrapped!, plaintext)).toBe(true);
  });

  test("round-trips empty input", () => {
    const wrapped = layer2Wrap(new Uint8Array(0), conversationKey);
    const unwrapped = layer2Unwrap(wrapped, conversationKey);
    expect(unwrapped).not.toBeNull();
    expect(unwrapped!.length).toBe(0);
  });

  test("two wraps of the same plaintext produce different ciphertext (fresh nonce each time)", () => {
    const plaintext = new TextEncoder().encode("same content twice");
    const wrapped1 = layer2Wrap(plaintext, conversationKey);
    const wrapped2 = layer2Wrap(plaintext, conversationKey);
    expect(bytesEqual(wrapped1, wrapped2)).toBe(false);
  });

  test("fails to unwrap with the wrong conversation key", () => {
    const plaintext = new TextEncoder().encode("secret");
    const wrapped = layer2Wrap(plaintext, conversationKey);
    const wrongKey = nacl.randomBytes(32);
    expect(layer2Unwrap(wrapped, wrongKey)).toBeNull();
  });

  test("fails to unwrap tampered ciphertext", () => {
    const plaintext = new TextEncoder().encode("secret payload");
    const wrapped = layer2Wrap(plaintext, conversationKey);
    const tampered = new Uint8Array(wrapped);
    tampered[tampered.length - 1] ^= 0xff; // flip a bit in the ciphertext/tag
    expect(layer2Unwrap(tampered, conversationKey)).toBeNull();
  });

  test("returns null (not throw) for input that was never layer-2-wrapped", () => {
    const notWrapped = new TextEncoder().encode("plain old JSON envelope, pre-layer-2");
    expect(layer2Unwrap(notWrapped, conversationKey)).toBeNull();
  });

  test("returns null for too-short input", () => {
    expect(layer2Unwrap(new Uint8Array(3), conversationKey)).toBeNull();
  });
});
