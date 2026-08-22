/**
 * Signal Protocol – high-level client API
 *
 * This module is the only surface the rest of the app touches.
 * It composes X3DH + Double Ratchet into two simple operations:
 *   - encryptForFirstMessage  (session setup + encrypt)
 *   - encryptMessage          (subsequent messages)
 *   - decryptMessage          (any incoming message)
 */

import naclUtil from "tweetnacl-util";
import { x3dhSend, x3dhReceive, type PreKeyBundle, type X3DHInitEnvelope } from "./x3dh";
import {
  initSenderState,
  initReceiverState,
  ratchetEncrypt,
  ratchetDecrypt,
  type RatchetState,
  type EncryptedEnvelope,
} from "./doubleRatchet";
import { loadSession, saveSession } from "./keyStorage";
import { getIdentityKeyPair, getSignedPreKeyPair, getOneTimePreKeyPair, markOneTimePreKeyUsed } from "./prekeyManager";
import { getCachedIdentityPublicKey } from "./identityKeyCache";
import { deriveLayer2ConversationKey, layer2Wrap, layer2Unwrap } from "./superEncrypt";

export type EncryptionState =
  | "no_keys"          // recipient has no key bundle yet
  | "securing"         // first message, session being established
  | "encrypted"        // session active
  | "session_reset";   // local session was reset/corrupted

export interface OutgoingMessage {
  // "v2-signal": JSON-serialised EncryptedEnvelope (base64 fields), as-is.
  // "v3-signal-layer2": that same JSON, wrapped a second time with an
  // independently-keyed layer-2 secretbox (see superEncrypt.ts) and
  // base64-encoded whole. Falls back to v2-signal when the peer's
  // identity key isn't available yet — the ratchet layer alone is
  // already full E2EE, so layer-2 is a bonus, not a requirement.
  ciphertext: string;
  encryptionVersion: "v2-signal" | "v3-signal-layer2";
  e2eeInitEnvelope: X3DHInitEnvelope | null; // non-null only for the very first message
}

export interface IncomingMessage {
  ciphertext: string;
  encryptionVersion: string;
  e2eeInitEnvelope?: X3DHInitEnvelope | null;
}

/**
 * Encrypt a message for a conversation partner.
 * Handles session bootstrapping automatically.
 *
 * @param myUserId      The local user id (used to key the session store)
 * @param theirUserId   The remote user id
 * @param plaintext     The plaintext to encrypt
 * @param bundle        The recipient's prekey bundle fetched from the server
 * @returns OutgoingMessage ready to POST to /api/messages
 */
export async function encryptMessage(
  myUserId: string,
  theirUserId: string,
  plaintext: string,
  bundle: PreKeyBundle | null
): Promise<OutgoingMessage> {
  let session = await loadSession(theirUserId);
  let initEnvelope: X3DHInitEnvelope | null = null;

  if (!session) {
    if (!bundle) throw new Error("no_keys");
    const myIKPair = await getIdentityKeyPair();
    if (!myIKPair) throw new Error("Local identity key pair missing");

    const { sharedKey, envelope, senderEphemeralKeyPair } = x3dhSend(myIKPair, bundle);
    initEnvelope = envelope;

    session = initSenderState(sharedKey, bundle.signedPreKey.publicKey);
    await saveSession(theirUserId, session);
  }

  const { newState, envelope: msgEnvelope } = ratchetEncrypt(session, plaintext);
  await saveSession(theirUserId, newState);

  const innerJson = JSON.stringify(msgEnvelope);

  const layer2 = await tryLayer2Wrap(myUserId, theirUserId, innerJson);
  if (layer2) {
    return {
      ciphertext: layer2,
      encryptionVersion: "v3-signal-layer2",
      e2eeInitEnvelope: initEnvelope,
    };
  }

  return {
    ciphertext: innerJson,
    encryptionVersion: "v2-signal",
    e2eeInitEnvelope: initEnvelope,
  };
}

/**
 * Best-effort layer-2 wrap of an already-serialised inner envelope.
 * Returns null (never throws) if either side's identity key isn't
 * available — the ratchet layer already provides full E2EE on its own,
 * so a layer-2 failure should never block sending a message.
 */
async function tryLayer2Wrap(
  myUserId: string,
  theirUserId: string,
  innerJson: string,
): Promise<string | null> {
  try {
    const myIKPair = await getIdentityKeyPair();
    if (!myIKPair) return null;
    const theirIdentityPublic = await getCachedIdentityPublicKey(theirUserId);
    if (!theirIdentityPublic) return null;
    const convoKey = deriveLayer2ConversationKey(myIKPair.secretKey, theirIdentityPublic, myUserId, theirUserId);
    const wrapped = layer2Wrap(naclUtil.decodeUTF8(innerJson), convoKey);
    return naclUtil.encodeBase64(wrapped);
  } catch {
    return null;
  }
}

/**
 * Decrypt an incoming message.
 *
 * @param myUserId     The local user id
 * @param theirUserId  The remote user id (the sender)
 * @param incoming     The raw incoming message object from the server
 * @returns The decrypted plaintext string
 */
export async function decryptMessage(
  myUserId: string,
  theirUserId: string,
  incoming: IncomingMessage
): Promise<string> {
  if (incoming.encryptionVersion !== "v2-signal" && incoming.encryptionVersion !== "v3-signal-layer2") {
    throw new Error("legacy");
  }

  let session = await loadSession(theirUserId);

  if (!session && incoming.e2eeInitEnvelope) {
    session = await bootstrapReceiverSession(incoming.e2eeInitEnvelope);
    if (!session) throw new Error("Could not bootstrap receiver session");
    await saveSession(theirUserId, session);
  }

  if (!session) throw new Error("No session and no init envelope");

  let innerJson = incoming.ciphertext;
  if (incoming.encryptionVersion === "v3-signal-layer2") {
    const myIKPair = await getIdentityKeyPair();
    const theirIdentityPublic = await getCachedIdentityPublicKey(theirUserId);
    if (!myIKPair || !theirIdentityPublic) {
      throw new Error("Cannot unwrap layer-2 payload — missing identity key material");
    }
    const convoKey = deriveLayer2ConversationKey(myIKPair.secretKey, theirIdentityPublic, myUserId, theirUserId);
    const unwrapped = layer2Unwrap(naclUtil.decodeBase64(incoming.ciphertext), convoKey);
    if (!unwrapped) throw new Error("Layer-2 unwrap failed — tampered or wrong key");
    innerJson = naclUtil.encodeUTF8(unwrapped);
  }

  let envelope: EncryptedEnvelope;
  try {
    envelope = JSON.parse(innerJson) as EncryptedEnvelope;
  } catch {
    throw new Error("Malformed ciphertext payload");
  }

  const { newState, plaintext } = ratchetDecrypt(session, envelope);
  await saveSession(theirUserId, newState);
  return plaintext;
}

/**
 * Wipe the local session for a user (e.g. after a key reset or reinstall signal).
 */
export async function resetSession(theirUserId: string): Promise<void> {
  await saveSession(theirUserId, null);
}

/**
 * Returns whether a live session exists for the given user.
 */
export async function hasSession(theirUserId: string): Promise<boolean> {
  const s = await loadSession(theirUserId);
  return s !== null;
}

// ─── Private helpers ─────────────────────────────────────────────────────────

async function bootstrapReceiverSession(
  initEnvelope: X3DHInitEnvelope
): Promise<RatchetState | null> {
  const myIKPair = await getIdentityKeyPair();
  const spkPair = await getSignedPreKeyPair(initEnvelope.usedSignedPreKeyId);
  if (!myIKPair || !spkPair) return null;

  let otpkPair: { publicKey: Uint8Array; secretKey: Uint8Array } | null = null;
  if (initEnvelope.usedOneTimePreKeyId) {
    otpkPair = await getOneTimePreKeyPair(initEnvelope.usedOneTimePreKeyId);
    if (otpkPair) {
      await markOneTimePreKeyUsed(initEnvelope.usedOneTimePreKeyId);
    }
  }

  const sharedKey = x3dhReceive(myIKPair, spkPair, otpkPair, initEnvelope);

  return initReceiverState(
    sharedKey,
    naclUtil.encodeBase64(spkPair.publicKey),
    naclUtil.encodeBase64(spkPair.secretKey)
  );
}
