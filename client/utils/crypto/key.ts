import nacl from "tweetnacl";

import naclUtil from "tweetnacl-util";



export function generateKeyPair() {

  const kp = nacl.box.keyPair();

  return {

    publicKey: naclUtil.encodeBase64(kp.publicKey),

    privateKey: naclUtil.encodeBase64(kp.secretKey),

  };

}