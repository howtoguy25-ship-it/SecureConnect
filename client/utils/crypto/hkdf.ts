import nacl from "tweetnacl";

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) { out.set(a, off); off += a.length; }
  return out;
}

export function hmacSha512(key: Uint8Array, data: Uint8Array): Uint8Array {
  const BLOCK = 128;
  let k = key.length > BLOCK ? nacl.hash(key) : key;
  const kPad = new Uint8Array(BLOCK);
  kPad.set(k);
  const ipad = kPad.map(b => b ^ 0x36);
  const opad = kPad.map(b => b ^ 0x5c);
  const inner = nacl.hash(concat(ipad, data));
  return nacl.hash(concat(opad, inner));
}

export function hkdf(
  ikm: Uint8Array,
  salt: Uint8Array | null,
  info: Uint8Array,
  length: number
): Uint8Array {
  const prk = hmacSha512(salt && salt.length > 0 ? salt : new Uint8Array(64), ikm);
  const out = new Uint8Array(length);
  let t = new Uint8Array(0);
  let offset = 0;
  let i = 1;
  while (offset < length) {
    const ctr = new Uint8Array([i & 0xff]);
    t = hmacSha512(prk, concat(t, info, ctr));
    const copy = Math.min(t.length, length - offset);
    out.set(t.slice(0, copy), offset);
    offset += copy;
    i++;
  }
  return out;
}
