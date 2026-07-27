/**
 * Prekey lifecycle management (client-side only)
 *
 * Generates and persists:
 *  - identity DH key pair  (X25519, via nacl.box)
 *  - signing key pair      (Ed25519, via nacl.sign) – for signing prekeys
 *  - signed prekey pair    (X25519) – medium-term, signed by signing key
 *  - one-time prekey pairs (X25519) – ephemeral, each used once
 *
 * Private key material never leaves the device.
 * Only public components + signatures are uploaded to the server.
 */

import nacl from "tweetnacl";
import naclUtil from "tweetnacl-util";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import * as Application from "expo-application";

const KEY_SIGNING_PRIVATE = "e2ee_signing_private";
const KEY_SIGNING_PUBLIC = "e2ee_signing_public";
const KEY_IDENTITY_PRIVATE = "e2ee_private_key";     // existing identity DH secret
const KEY_IDENTITY_PUBLIC = "e2ee_identity_public";

const KEY_SPK_PREFIX = "e2ee_spk_";       // keyed by id
const KEY_OPK_PREFIX = "e2ee_opk_";       // keyed by id
const KEY_OPK_LIST = "e2ee_opk_ids";      // comma-separated list of active OPK ids
const KEY_CURRENT_SPK_ID = "e2ee_spk_current_id"; // id of the active uploaded SPK
const KEY_SPK_LIST = "e2ee_spk_ids";              // comma-separated list of known SPK ids (for grace-period cleanup)

// Exposed so logout / wipeE2EEKeys can enumerate every prekey id and delete
// the matching SecureStore entry. Keep these in sync with the constants above.
export const PREKEY_STORAGE_KEYS = {
  KEY_SIGNING_PRIVATE,
  KEY_SIGNING_PUBLIC,
  KEY_IDENTITY_PRIVATE,
  KEY_IDENTITY_PUBLIC,
  KEY_SPK_PREFIX,
  KEY_OPK_PREFIX,
  KEY_OPK_LIST,
  KEY_CURRENT_SPK_ID,
  KEY_SPK_LIST,
} as const;

// Rotate the active signed prekey after this many days. Bundles include an SPK
// signature so this is a roll-forward, not a rekey; old messages still decrypt.
const SPK_ROTATION_DAYS = 7;
// How long an old SPK is kept around for late-arriving X3DH init envelopes
// that referenced it. After this, the private half is wiped.
const SPK_RETENTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

// ─── SecureStore wrappers ─────────────────────────────────────────────────────

async function secureGet(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    try { return localStorage.getItem(key); } catch { return null; }
  }
  return SecureStore.getItemAsync(key);
}

async function secureSet(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    try { localStorage.setItem(key, value); } catch {}
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function secureDelete(key: string): Promise<void> {
  if (Platform.OS === "web") {
    try { localStorage.removeItem(key); } catch {}
    return;
  }
  try { await SecureStore.deleteItemAsync(key); } catch {}
}

// ─── Identity key pair (X25519) ──────────────────────────────────────────────

export async function getIdentityKeyPair(): Promise<{ publicKey: Uint8Array; secretKey: Uint8Array } | null> {
  const priv = await secureGet(KEY_IDENTITY_PRIVATE);
  if (!priv) return null;
  const secretKey = naclUtil.decodeBase64(priv);
  const publicKey = nacl.scalarMult.base(secretKey);
  return { publicKey, secretKey };
}

export async function ensureIdentityKeyPair(token: string, apiBase: string): Promise<{ publicKey: string; secretKey: string }> {
  const existing = await secureGet(KEY_IDENTITY_PRIVATE);
  if (existing) {
    const secretKey = naclUtil.decodeBase64(existing);
    const publicKey = nacl.scalarMult.base(secretKey);
    return { publicKey: naclUtil.encodeBase64(publicKey), secretKey: existing };
  }
  const kp = nacl.box.keyPair();
  const pub = naclUtil.encodeBase64(kp.publicKey);
  const priv = naclUtil.encodeBase64(kp.secretKey);
  await secureSet(KEY_IDENTITY_PRIVATE, priv);
  await secureSet(KEY_IDENTITY_PUBLIC, pub);
  await uploadIdentityKey(pub, token, apiBase);
  return { publicKey: pub, secretKey: priv };
}

async function uploadIdentityKey(publicKey: string, token: string, apiBase: string): Promise<void> {
  await fetch(`${apiBase}/api/keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ publicKey }),
  });
}

// ─── Signing key pair (Ed25519) ───────────────────────────────────────────────

export async function ensureSigningKeyPair(): Promise<{ publicKey: Uint8Array; secretKey: Uint8Array }> {
  const existing = await secureGet(KEY_SIGNING_PRIVATE);
  if (existing) {
    const secretKey = naclUtil.decodeBase64(existing);
    const publicKey = naclUtil.decodeBase64((await secureGet(KEY_SIGNING_PUBLIC))!);
    return { publicKey, secretKey };
  }
  const kp = nacl.sign.keyPair();
  await secureSet(KEY_SIGNING_PRIVATE, naclUtil.encodeBase64(kp.secretKey));
  await secureSet(KEY_SIGNING_PUBLIC, naclUtil.encodeBase64(kp.publicKey));
  return kp;
}

export async function getSigningKeyPair(): Promise<{ publicKey: Uint8Array; secretKey: Uint8Array } | null> {
  const priv = await secureGet(KEY_SIGNING_PRIVATE);
  const pub = await secureGet(KEY_SIGNING_PUBLIC);
  if (!priv || !pub) return null;
  return {
    publicKey: naclUtil.decodeBase64(pub),
    secretKey: naclUtil.decodeBase64(priv),
  };
}

// ─── Signed prekey (X25519, signed by Ed25519 signing key) ───────────────────

export async function generateSignedPreKey(
  signingKeyPair: { publicKey: Uint8Array; secretKey: Uint8Array }
): Promise<{ id: string; publicKey: string; secretKey: string; signature: string }> {
  const kp = nacl.box.keyPair();
  const id = `spk_${Date.now()}`;
  const pub = naclUtil.encodeBase64(kp.publicKey);
  const priv = naclUtil.encodeBase64(kp.secretKey);
  const signature = naclUtil.encodeBase64(
    nacl.sign.detached(kp.publicKey, signingKeyPair.secretKey)
  );
  // createdAt added so rotation logic can tell when this SPK was minted.
  // Old records without createdAt are treated as stale (force rotation).
  await secureSet(`${KEY_SPK_PREFIX}${id}`, JSON.stringify({ pub, priv, createdAt: Date.now() }));
  await addSPKToList(id);
  await secureSet(KEY_CURRENT_SPK_ID, id);
  return { id, publicKey: pub, secretKey: priv, signature };
}

export async function getSignedPreKeyPair(id: string): Promise<{ publicKey: Uint8Array; secretKey: Uint8Array } | null> {
  const raw = await secureGet(`${KEY_SPK_PREFIX}${id}`);
  if (!raw) return null;
  try {
    const { pub, priv } = JSON.parse(raw);
    return {
      publicKey: naclUtil.decodeBase64(pub),
      secretKey: naclUtil.decodeBase64(priv),
    };
  } catch {
    return null;
  }
}

// ─── Signed prekey rotation ──────────────────────────────────────────────────

async function getKnownSPKIds(): Promise<string[]> {
  const raw = await secureGet(KEY_SPK_LIST);
  if (!raw) return [];
  return raw.split(",").filter(Boolean);
}

async function addSPKToList(id: string): Promise<void> {
  const ids = await getKnownSPKIds();
  if (!ids.includes(id)) {
    ids.push(id);
    await secureSet(KEY_SPK_LIST, ids.join(","));
  }
}

async function getSPKCreatedAt(id: string): Promise<number | null> {
  const raw = await secureGet(`${KEY_SPK_PREFIX}${id}`);
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    return typeof obj.createdAt === "number" ? obj.createdAt : null;
  } catch {
    return null;
  }
}

/**
 * If the currently-active signed prekey is older than SPK_ROTATION_DAYS,
 * generate a fresh one, upload its public half + signature, and mark it as
 * current. The old SPK is intentionally kept on disk so late-arriving X3DH
 * init envelopes that referenced it can still bootstrap a session;
 * cleanupExpiredSignedPreKeys removes it after SPK_RETENTION_DAYS.
 *
 * Network failures are swallowed by the caller — see MainApp.tsx.
 *
 * Returns true if a rotation actually happened, false otherwise.
 */
export async function rotateSignedPreKeyIfStale(token: string, apiBase: string): Promise<boolean> {
  const currentId = await secureGet(KEY_CURRENT_SPK_ID);
  let isStale = false;

  if (!currentId) {
    // Pre-rotation builds (e.g. build 60 users) never set KEY_CURRENT_SPK_ID.
    // Trigger a rotation so we start tracking ages from now on.
    isStale = true;
  } else {
    const createdAt = await getSPKCreatedAt(currentId);
    if (createdAt === null) {
      // SPK record predates createdAt field — treat as stale.
      isStale = true;
    } else {
      const ageMs = Date.now() - createdAt;
      isStale = ageMs > SPK_ROTATION_DAYS * DAY_MS;
    }
  }

  if (!isStale) return false;

  const signingPair = await getSigningKeyPair();
  if (!signingPair) return false;

  const fresh = await generateSignedPreKey(signingPair);

  const resp = await fetch(`${apiBase}/api/e2ee/prekeys/signed`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      keyId: fresh.id,
      publicKey: fresh.publicKey,
      signature: fresh.signature,
    }),
  });

  if (!resp.ok) {
    // Server didn't accept — leave the new SPK locally so retries on next
    // foreground succeed, but don't crash. Caller wraps in try/catch.
    throw new Error(`SPK upload failed: HTTP ${resp.status}`);
  }

  // Opportunistically clean up SPKs older than the retention window.
  await cleanupExpiredSignedPreKeys();
  return true;
}

/**
 * Delete SPK private-key material for entries older than SPK_RETENTION_DAYS.
 * Called from rotateSignedPreKeyIfStale; safe to call independently.
 */
export async function cleanupExpiredSignedPreKeys(): Promise<void> {
  const ids = await getKnownSPKIds();
  const currentId = await secureGet(KEY_CURRENT_SPK_ID);
  const now = Date.now();
  const survivors: string[] = [];

  for (const id of ids) {
    if (id === currentId) {
      survivors.push(id);
      continue;
    }
    const createdAt = await getSPKCreatedAt(id);
    // Missing createdAt → unknown age → keep one more cycle to be safe.
    if (createdAt === null) {
      survivors.push(id);
      continue;
    }
    if (now - createdAt > SPK_RETENTION_DAYS * DAY_MS) {
      try { await secureDelete(`${KEY_SPK_PREFIX}${id}`); } catch {}
    } else {
      survivors.push(id);
    }
  }

  if (survivors.length !== ids.length) {
    await secureSet(KEY_SPK_LIST, survivors.join(","));
  }
}

// ─── One-time prekeys (X25519) ────────────────────────────────────────────────

export async function generateOneTimePreKeys(count: number): Promise<Array<{ id: string; publicKey: string }>> {
  const keys: Array<{ id: string; publicKey: string }> = [];
  const existingIds = await getActiveOTPKIds();

  for (let i = 0; i < count; i++) {
    const kp = nacl.box.keyPair();
    const id = `opk_${Date.now()}_${i}`;
    const pub = naclUtil.encodeBase64(kp.publicKey);
    const priv = naclUtil.encodeBase64(kp.secretKey);
    await secureSet(`${KEY_OPK_PREFIX}${id}`, JSON.stringify({ pub, priv }));
    existingIds.push(id);
    keys.push({ id, publicKey: pub });
  }

  await secureSet(KEY_OPK_LIST, existingIds.join(","));
  return keys;
}

export async function getOneTimePreKeyPair(id: string): Promise<{ publicKey: Uint8Array; secretKey: Uint8Array } | null> {
  const raw = await secureGet(`${KEY_OPK_PREFIX}${id}`);
  if (!raw) return null;
  try {
    const { pub, priv } = JSON.parse(raw);
    return {
      publicKey: naclUtil.decodeBase64(pub),
      secretKey: naclUtil.decodeBase64(priv),
    };
  } catch {
    return null;
  }
}

export async function markOneTimePreKeyUsed(id: string): Promise<void> {
  await secureDelete(`${KEY_OPK_PREFIX}${id}`);
  const ids = await getActiveOTPKIds();
  const updated = ids.filter(i => i !== id);
  await secureSet(KEY_OPK_LIST, updated.join(","));
}

async function getActiveOTPKIds(): Promise<string[]> {
  const raw = await secureGet(KEY_OPK_LIST);
  if (!raw) return [];
  return raw.split(",").filter(Boolean);
}

export async function getActiveOTPKCount(): Promise<number> {
  return (await getActiveOTPKIds()).length;
}

// ─── Device registration + prekey upload ─────────────────────────────────────

export async function registerDeviceAndUploadPrekeys(
  token: string,
  apiBase: string,
  deviceId: string
): Promise<void> {
  const ikPair = await ensureIdentityKeyPair(token, apiBase);
  const signingPair = await ensureSigningKeyPair();
  const signedPreKey = await generateSignedPreKey(signingPair);
  const oneTimePreKeys = await generateOneTimePreKeys(100);

  await fetch(`${apiBase}/api/e2ee/devices/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      deviceId,
      identityPublicKey: ikPair.publicKey,
      signingPublicKey: naclUtil.encodeBase64(signingPair.publicKey),
    }),
  });

  await fetch(`${apiBase}/api/e2ee/prekeys/signed`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      keyId: signedPreKey.id,
      publicKey: signedPreKey.publicKey,
      signature: signedPreKey.signature,
    }),
  });

  const BATCH_SIZE = 20;
  for (let i = 0; i < oneTimePreKeys.length; i += BATCH_SIZE) {
    const batch = oneTimePreKeys.slice(i, i + BATCH_SIZE);
    await fetch(`${apiBase}/api/e2ee/prekeys/onetime`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ keys: batch }),
    });
  }
}

/**
 * Phase 2 build 62 — wipe ALL prekey + identity material from this device.
 *
 * Called by `wipeE2EEKeys()` (see keyStorage.ts) which is in turn called by
 * `clearAuth()` on logout / suspension / account deletion. After this returns,
 * any future E2EE operation must re-run the full bootstrap (identity gen +
 * SPK gen + OPK batch + server upload).
 *
 * Best-effort: a failure deleting one entry must not block deleting the rest,
 * so we swallow exceptions per-key and only log in dev.
 */
export async function wipeAllPrekeyMaterial(): Promise<void> {
  // Identity + signing keys (fixed names).
  const fixedKeys = [
    KEY_SIGNING_PRIVATE,
    KEY_SIGNING_PUBLIC,
    KEY_IDENTITY_PRIVATE,
    KEY_IDENTITY_PUBLIC,
    KEY_CURRENT_SPK_ID,
  ];
  for (const k of fixedKeys) {
    await secureDelete(k);
  }

  // Enumerate SPKs and OPKs from their id lists, delete each private blob,
  // then delete the lists themselves.
  const spkIdsRaw = await secureGet(KEY_SPK_LIST);
  if (spkIdsRaw) {
    const ids = spkIdsRaw.split(",").filter(Boolean);
    for (const id of ids) {
      await secureDelete(`${KEY_SPK_PREFIX}${id}`);
    }
  }
  await secureDelete(KEY_SPK_LIST);

  const opkIdsRaw = await secureGet(KEY_OPK_LIST);
  if (opkIdsRaw) {
    const ids = opkIdsRaw.split(",").filter(Boolean);
    for (const id of ids) {
      await secureDelete(`${KEY_OPK_PREFIX}${id}`);
    }
  }
  await secureDelete(KEY_OPK_LIST);
}

export async function replenishOneTimePreKeysIfNeeded(
  token: string,
  apiBase: string,
  threshold = 10
): Promise<void> {
  const count = await getActiveOTPKCount();
  if (count >= threshold) return;
  const newKeys = await generateOneTimePreKeys(50);
  await fetch(`${apiBase}/api/e2ee/prekeys/onetime`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ keys: newKeys }),
  });
}

// ─── Device identifier ────────────────────────────────────────────────────────

/**
 * Returns a stable device identifier for the current device.
 * Matches the identifier used when registering device keys.
 */
export async function getDeviceId(): Promise<string> {
  if (Platform.OS === "ios") {
    try {
      const id = await Application.getIosIdForVendorAsync();
      return id ?? `ios-${Date.now()}`;
    } catch {
      return `ios-${Date.now()}`;
    }
  }
  if (Platform.OS === "android") {
    try {
      const id = Application.getAndroidId();
      return id ?? `android-${Date.now()}`;
    } catch {
      return `android-${Date.now()}`;
    }
  }
  return `web-${typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 20) : Date.now()}`;
}
