/**
 * Real end-to-end encryption for login-event metadata (IP address, device
 * name, platform, user agent).
 *
 * Before this module existed, these fields were encrypted at rest with a
 * symmetric key the server itself held -- which means the server could
 * always decrypt its own writes. That's confidentiality against someone who
 * steals a DB snapshot; it is not E2EE, and conflating the two is exactly
 * the claim the user rejected.
 *
 * This seals each field to the recipient DEVICE's own X25519 public key
 * (the same identity key used for this app's Signal-protocol messaging)
 * using the standard "sealed box" construction: a fresh, one-use sender
 * keypair is generated per field, `nacl.box` encrypts with it, and the
 * ephemeral secret key is discarded immediately -- never stored, logged, or
 * returned. After `sealLoginField` returns, nothing the server holds (not
 * its DB, not its process memory, not its source code) can decrypt the
 * result. Only whoever holds the matching private key -- which never leaves
 * the device it was generated on -- can open it.
 */
import nacl from "tweetnacl";
import naclUtil from "tweetnacl-util";

const SEALED_PREFIX = "e2ee1:";

export function sealLoginField(plaintext: string, recipientPublicKeyB64: string): string | null {
  try {
    const recipientPublicKey = naclUtil.decodeBase64(recipientPublicKeyB64);
    if (recipientPublicKey.length !== nacl.box.publicKeyLength) return null;
    const ephemeral = nacl.box.keyPair();
    const nonce = nacl.randomBytes(nacl.box.nonceLength);
    const message = naclUtil.decodeUTF8(plaintext);
    const ciphertext = nacl.box(message, nonce, recipientPublicKey, ephemeral.secretKey);
    return `${SEALED_PREFIX}${naclUtil.encodeBase64(ephemeral.publicKey)}:${naclUtil.encodeBase64(nonce)}:${naclUtil.encodeBase64(ciphertext)}`;
  } catch {
    return null;
  }
}

export function isSealedLoginField(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(SEALED_PREFIX);
}
