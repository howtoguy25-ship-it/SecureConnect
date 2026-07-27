import nacl from "tweetnacl";
import naclUtil from "tweetnacl-util";

export function encryptMessage(
  sharedSecretBase64: string,
  message: string
): { nonce: string; ciphertext: string } {
  const secret = naclUtil.decodeBase64(sharedSecretBase64);
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const messageBytes = naclUtil.decodeUTF8(message);
  const encrypted = nacl.secretbox(messageBytes, nonce, secret);

  return {
    nonce: naclUtil.encodeBase64(nonce),
    ciphertext: naclUtil.encodeBase64(encrypted),
  };
}
