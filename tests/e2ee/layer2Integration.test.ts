/**
 * Integration test for the Layer-2 encryption addition — exercises the
 * SAME sequence of operations signalProtocol.ts, encryptedMediaClient.ts,
 * and callE2EE.ts perform internally, just with directly-supplied key
 * material instead of going through SecureStore (which isn't mocked in
 * this test environment — see prekeyRotation.test.ts).
 *
 * The point: superEncrypt.test.ts already verifies the Layer-2 primitives
 * in isolation. This test verifies the INTEGRATION — that wiring them
 * into the real X3DH + Double Ratchet + media pipeline actually round-
 * trips correctly end to end, catching the class of bug a pure unit test
 * of superEncrypt.ts alone can't catch (wrong encoding, wrong field,
 * wrong side's key used, etc.) — exactly the kind of gap that turned up
 * once already in the sealed-sender wiring during manual review.
 */

import nacl from "tweetnacl";
import naclUtil from "tweetnacl-util";
import { x3dhSend, x3dhReceive, type PreKeyBundle } from "../../client/utils/crypto/x3dh";
import {
  initSenderState,
  initReceiverState,
  ratchetEncrypt,
  ratchetDecrypt,
} from "../../client/utils/crypto/doubleRatchet";
import {
  encryptMedia,
  decryptMedia,
  generateMediaKey,
} from "../../client/utils/crypto/mediaEncryption";
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

interface Party {
  userId: string;
  identity: { publicKey: Uint8Array; secretKey: Uint8Array };
  signing: nacl.SignKeyPair;
  signedPreKey: { id: string; keyPair: { publicKey: Uint8Array; secretKey: Uint8Array } };
}

function makeParty(userId: string): Party {
  const identity = nacl.box.keyPair();
  const signing = nacl.sign.keyPair();
  const spkKeyPair = nacl.box.keyPair();
  return {
    userId,
    identity,
    signing,
    signedPreKey: { id: "spk-1", keyPair: spkKeyPair },
  };
}

function bundleFor(party: Party): PreKeyBundle {
  const signature = nacl.sign.detached(party.signedPreKey.keyPair.publicKey, party.signing.secretKey);
  return {
    userId: party.userId,
    identityPublicKey: naclUtil.encodeBase64(party.identity.publicKey),
    signingPublicKey: naclUtil.encodeBase64(party.signing.publicKey),
    signedPreKey: {
      id: party.signedPreKey.id,
      publicKey: naclUtil.encodeBase64(party.signedPreKey.keyPair.publicKey),
      signature: naclUtil.encodeBase64(signature),
    },
  };
}

describe("Layer-2 message pipeline (X3DH + Double Ratchet + Layer-2 wrap)", () => {
  test("Alice -> Bob: full send/receive round-trip through layer-2, exactly mirroring signalProtocol.ts", () => {
    const alice = makeParty("alice-id");
    const bob = makeParty("bob-id");

    // --- Alice: encryptMessage()'s "no existing session" branch ---
    const bobBundle = bundleFor(bob);
    const { sharedKey, envelope: initEnvelope } = x3dhSend(alice.identity, bobBundle);
    let aliceSession = initSenderState(sharedKey, bobBundle.signedPreKey.publicKey);

    const plaintext = "Hey Bob, this is layer-2 protected now.";
    const { newState: aliceStateAfterSend, envelope: msgEnvelope } = ratchetEncrypt(aliceSession, plaintext);
    aliceSession = aliceStateAfterSend;

    // Alice's tryLayer2Wrap(): JSON.stringify -> decodeUTF8 -> layer2Wrap -> encodeBase64
    const innerJson = JSON.stringify(msgEnvelope);
    const aliceConvoKey = deriveLayer2ConversationKey(
      alice.identity.secretKey,
      bob.identity.publicKey,
      alice.userId,
      bob.userId,
    );
    const wireCiphertext = naclUtil.encodeBase64(
      layer2Wrap(naclUtil.decodeUTF8(innerJson), aliceConvoKey),
    );
    const encryptionVersion = "v3-signal-layer2";

    // --- "the wire": wireCiphertext + encryptionVersion travel to Bob ---

    // --- Bob: decryptMessage()'s bootstrap + layer-2-unwrap branch ---
    let bobSession = initReceiverState(
      x3dhReceive(bob.identity, bob.signedPreKey.keyPair, null, initEnvelope),
      naclUtil.encodeBase64(bob.signedPreKey.keyPair.publicKey),
      naclUtil.encodeBase64(bob.signedPreKey.keyPair.secretKey),
    );

    expect(encryptionVersion).toBe("v3-signal-layer2");
    const bobConvoKey = deriveLayer2ConversationKey(
      bob.identity.secretKey,
      alice.identity.publicKey,
      bob.userId,
      alice.userId,
    );
    // Both sides must derive the identical conversation key despite
    // computing it from "their own secret + the other's public" in
    // opposite directions.
    expect(bytesEqual(aliceConvoKey, bobConvoKey)).toBe(true);

    const unwrapped = layer2Unwrap(naclUtil.decodeBase64(wireCiphertext), bobConvoKey);
    expect(unwrapped).not.toBeNull();
    const bobInnerJson = naclUtil.encodeUTF8(unwrapped!);
    expect(bobInnerJson).toBe(innerJson);

    const bobEnvelope = JSON.parse(bobInnerJson);
    const { plaintext: recovered } = ratchetDecrypt(bobSession, bobEnvelope);

    expect(recovered).toBe(plaintext);
  });

  test("a v3 payload cannot be unwrapped with the wrong pair's conversation key", () => {
    const alice = makeParty("alice-id");
    const bob = makeParty("bob-id");
    const mallory = makeParty("mallory-id");

    const aliceConvoKey = deriveLayer2ConversationKey(
      alice.identity.secretKey, bob.identity.publicKey, alice.userId, bob.userId,
    );
    const wrapped = layer2Wrap(naclUtil.decodeUTF8("some ratchet envelope json"), aliceConvoKey);

    // Mallory doesn't share a conversation with Alice, so her derived key
    // (against her own identity keypair) can never match.
    const malloryConvoKey = deriveLayer2ConversationKey(
      mallory.identity.secretKey, alice.identity.publicKey, mallory.userId, alice.userId,
    );
    expect(layer2Unwrap(wrapped, malloryConvoKey)).toBeNull();
  });
});

describe("Layer-2 media pipeline (SCM1 + Layer-2 wrap), mirroring encryptedMediaClient.ts", () => {
  test("upload/download round-trip: plaintext -> SCM1 -> layer2Wrap -> layer2Unwrap -> SCM1 -> plaintext", () => {
    const alice = makeParty("alice-id");
    const bob = makeParty("bob-id");

    const filePlaintext = new TextEncoder().encode("pretend this is JPEG bytes ".repeat(50));
    const mediaKey = generateMediaKey();
    const { ciphertext: scm1Ciphertext } = encryptMedia(filePlaintext, mediaKey);

    // Sender-side (uploadEncryptedMedia): wrap the SCM1 ciphertext.
    const senderConvoKey = deriveLayer2ConversationKey(
      alice.identity.secretKey, bob.identity.publicKey, alice.userId, bob.userId,
    );
    const uploadedBytes = layer2Wrap(scm1Ciphertext, senderConvoKey);

    // --- "the wire": uploadedBytes sit on the server as the object body ---

    // Recipient-side (fetchAndDecryptEncryptedMedia): unwrap then SCM1-decrypt.
    const recipientConvoKey = deriveLayer2ConversationKey(
      bob.identity.secretKey, alice.identity.publicKey, bob.userId, alice.userId,
    );
    const unwrapped = layer2Unwrap(uploadedBytes, recipientConvoKey);
    expect(unwrapped).not.toBeNull();
    const recoveredPlaintext = decryptMedia(unwrapped!, mediaKey);

    expect(bytesEqual(recoveredPlaintext, filePlaintext)).toBe(true);
  });
});

describe("Layer-2 call key mixing, mirroring callE2EE.ts's deriveCallKey", () => {
  test("both sides' static-static identity DH matches (the value mixed into the LiveKit key)", () => {
    const alice = makeParty("alice-id");
    const bob = makeParty("bob-id");

    const aliceSideStatic = nacl.scalarMult(alice.identity.secretKey, bob.identity.publicKey);
    const bobSideStatic = nacl.scalarMult(bob.identity.secretKey, alice.identity.publicKey);

    expect(bytesEqual(aliceSideStatic, bobSideStatic)).toBe(true);
    expect(aliceSideStatic.length).toBe(32);
  });
});
