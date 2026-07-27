import nacl from "tweetnacl";
import naclUtil from "tweetnacl-util";

export function decryptMessage(
  sharedSecretBase64: string,
  payload: { nonce: string; ciphertext: string }
): string | null {
  try {
    const secret = naclUtil.decodeBase64(sharedSecretBase64);
    const nonce = naclUtil.decodeBase64(payload.nonce);
    const ciphertext = naclUtil.decodeBase64(payload.ciphertext);
    const decrypted = nacl.secretbox.open(ciphertext, nonce, secret);

    if (!decrypted) return null;
    return naclUtil.encodeUTF8(decrypted);
  } catch {
    return null;
  }
}
