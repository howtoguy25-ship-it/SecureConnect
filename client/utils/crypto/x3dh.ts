/**
 * X3DH (Extended Triple Diffie-Hellman) Key Agreement
 *
 * Alice sends Bob a message for the first time:
 *  1. Alice fetches Bob's prekey bundle (IK_B, SPK_B, sig, OPK_B?)
 *  2. Alice verifies the signed prekey signature
 *  3. Alice generates a fresh ephemeral DH key pair (EK_A)
 *  4. SK = KDF(DH(IK_A, SPK_B) || DH(EK_A, IK_B) || DH(EK_A, SPK_B) [|| DH(EK_A, OPK_B)])
 *  5. Alice initialises the Double Ratchet with (SK, DHr = SPK_B.pub)
 *
 * Bob recovers the same SK from the X3DH init envelope attached to the first message.
 */

import nacl from "tweetnacl";
import naclUtil from "tweetnacl-util";
import { hkdf } from "./hkdf";

// HKDF domain-separation tag. WIRE-PROTOCOL STRING — DO NOT RENAME.
// Changing this label invalidates every existing X3DH session against
// every other client (legacy "SecureConnect" branded clients on Build 61
// and earlier still derive against this exact string).
const X3DH_INFO = new TextEncoder().encode("SecureConnect-X3DH-v1");

function dh(mySecretKey: Uint8Array, theirPublicKey: Uint8Array): Uint8Array {
  return nacl.scalarMult(mySecretKey, theirPublicKey);
}

function deriveSharedKey(...dhOutputs: Uint8Array[]): Uint8Array {
  const ikm = new Uint8Array(dhOutputs.reduce((s, a) => s + a.length, 0));
  let off = 0;
  for (const d of dhOutputs) { ikm.set(d, off); off += d.length; }
  return hkdf(ikm, null, X3DH_INFO, 32);
}

export interface PreKeyBundle {
  userId: string;
  identityPublicKey: string;   // base64 X25519 public key
  signingPublicKey: string;    // base64 Ed25519 public key
  signedPreKey: {
    id: string;
    publicKey: string;         // base64 X25519 public key
    signature: string;         // base64 Ed25519 signature over the SPK public key bytes
  };
  oneTimePreKey?: {
    id: string;
    publicKey: string;         // base64 X25519 public key
  };
}

export interface X3DHInitEnvelope {
  version: "v2-signal";
  senderIdentityPublicKey: string;   // base64
  senderEphemeralPublicKey: string;  // base64
  usedSignedPreKeyId: string;
  usedOneTimePreKeyId: string | null;
}

export interface X3DHSenderResult {
  sharedKey: Uint8Array;
  envelope: X3DHInitEnvelope;
  senderEphemeralKeyPair: { publicKey: Uint8Array; secretKey: Uint8Array };
}

/**
 * Run X3DH as the sender (Alice).
 * Returns the 32-byte shared key and the init envelope to send to the server.
 */
export function x3dhSend(
  senderIdentityKeyPair: { publicKey: Uint8Array; secretKey: Uint8Array },
  recipientBundle: PreKeyBundle
): X3DHSenderResult {
  const IK_A = senderIdentityKeyPair;
  const IK_B_pub = naclUtil.decodeBase64(recipientBundle.identityPublicKey);
  const SPK_B_pub = naclUtil.decodeBase64(recipientBundle.signedPreKey.publicKey);
  const SPK_B_sig = naclUtil.decodeBase64(recipientBundle.signedPreKey.signature);
  const signing_B_pub = naclUtil.decodeBase64(recipientBundle.signingPublicKey);

  const signatureValid = nacl.sign.detached.verify(SPK_B_pub, SPK_B_sig, signing_B_pub);
  if (!signatureValid) {
    throw new Error("Signed prekey signature is invalid – possible key tampering");
  }

  const EK_A = nacl.box.keyPair();

  const DH1 = dh(IK_A.secretKey, SPK_B_pub);
  const DH2 = dh(EK_A.secretKey, IK_B_pub);
  const DH3 = dh(EK_A.secretKey, SPK_B_pub);

  const dhValues: Uint8Array[] = [DH1, DH2, DH3];

  let otpkId: string | null = null;
  if (recipientBundle.oneTimePreKey) {
    const OPK_B_pub = naclUtil.decodeBase64(recipientBundle.oneTimePreKey.publicKey);
    dhValues.push(dh(EK_A.secretKey, OPK_B_pub));
    otpkId = recipientBundle.oneTimePreKey.id;
  }

  const sharedKey = deriveSharedKey(...dhValues);

  const envelope: X3DHInitEnvelope = {
    version: "v2-signal",
    senderIdentityPublicKey: naclUtil.encodeBase64(IK_A.publicKey),
    senderEphemeralPublicKey: naclUtil.encodeBase64(EK_A.publicKey),
    usedSignedPreKeyId: recipientBundle.signedPreKey.id,
    usedOneTimePreKeyId: otpkId,
  };

  return { sharedKey, envelope, senderEphemeralKeyPair: EK_A };
}

/**
 * Run X3DH as the receiver (Bob).
 * Bob reconstructs the same sharedKey from his own key material.
 */
export function x3dhReceive(
  receiverIdentityKeyPair: { publicKey: Uint8Array; secretKey: Uint8Array },
  receiverSignedPreKeyPair: { publicKey: Uint8Array; secretKey: Uint8Array },
  receiverOneTimePreKeyPair: { publicKey: Uint8Array; secretKey: Uint8Array } | null,
  envelope: X3DHInitEnvelope
): Uint8Array {
  const IK_B = receiverIdentityKeyPair;
  const SPK_B = receiverSignedPreKeyPair;
  const IK_A_pub = naclUtil.decodeBase64(envelope.senderIdentityPublicKey);
  const EK_A_pub = naclUtil.decodeBase64(envelope.senderEphemeralPublicKey);

  const DH1 = dh(SPK_B.secretKey, IK_A_pub);
  const DH2 = dh(IK_B.secretKey, EK_A_pub);
  const DH3 = dh(SPK_B.secretKey, EK_A_pub);

  const dhValues: Uint8Array[] = [DH1, DH2, DH3];

  if (receiverOneTimePreKeyPair) {
    dhValues.push(dh(receiverOneTimePreKeyPair.secretKey, EK_A_pub));
  }

  return deriveSharedKey(...dhValues);
}
