import nacl from "tweetnacl";

import naclUtil from "tweetnacl-util";



export function deriveSharedSecret(

  myPrivateKeyBase64: string,

  theirPublicKeyBase64: string

) {

  const myPrivate = naclUtil.decodeBase64(myPrivateKeyBase64);

  const theirPublic = naclUtil.decodeBase64(theirPublicKeyBase64);



  const secret = nacl.box.before(theirPublic, myPrivate);

  return naclUtil.encodeBase64(secret);

}