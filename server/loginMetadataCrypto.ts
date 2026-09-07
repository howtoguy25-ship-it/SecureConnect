import crypto from "crypto";

/**
 * Encryption-at-rest for login_events' display-only metadata (IP address,
 * device name, user agent, platform) — build 135.
 *
 * This is NOT end-to-end encryption. The server holds the key and can
 * decrypt this data any time it needs to (the concurrent-session-hijack
 * alert feature has to actually read these values to compare sessions).
 * What this protects against: a stolen database backup, a leaked pg_dump,
 * or raw-row access by anyone other than the running app server seeing
 * these fields in plaintext. Before this, they were stored as plain text
 * columns — real functionality, but genuinely unencrypted at rest.
 *
 * deviceId is deliberately NOT included here — recordLoginEvent/
 * bumpTokenVersion match on it via SQL equality (eq(loginEvents.deviceId,
 * ...)) to find/demote a device's prior session, and AES-GCM's random IV
 * makes every ciphertext of the same plaintext different, which would
 * break that lookup entirely. ipAddress/deviceName/userAgent/platform are
 * never compared in a WHERE clause anywhere in this codebase — only ever
 * stored and displayed — so they're safe to encrypt non-deterministically.
 *
 * Key material: derived from SESSION_SECRET (already required, >=32 chars,
 * validated at boot in routes.ts) via SHA-256 with a distinct context
 * label, rather than requiring a second secret to be provisioned on top of
 * it. This is real key derivation, not just reusing the JWT secret bytes
 * directly — a compromise of one use doesn't hand over the other's key.
 */
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM standard nonce size

let cachedKey: Buffer | null = null;
function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const secret = process.env.SESSION_SECRET || "securechat-secret-key-dev-only-do-not-use-in-prod";
  cachedKey = crypto.createHash("sha256").update(`login-metadata-v1:${secret}`).digest();
  return cachedKey;
}

/** Returns null unchanged (nothing to encrypt) so callers can pass through
 * optional fields without an extra null check at every call site. */
export function encryptLoginField(plaintext: string | null | undefined): string | null {
  if (plaintext == null) return null;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // iv:authTag:ciphertext, all base64 — self-contained so decrypt needs
  // nothing but this string and the server's own key.
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`;
}

/** Best-effort: returns the input unchanged if it isn't in the
 * iv:authTag:ciphertext shape this module produces — covers rows written
 * before this encryption existed, so old login history doesn't turn into
 * garbage or throw when displayed. */
export function decryptLoginField(stored: string | null | undefined): string | null {
  if (stored == null) return null;
  const parts = stored.split(":");
  if (parts.length !== 3) return stored;
  try {
    const [ivB64, authTagB64, cipherB64] = parts;
    const iv = Buffer.from(ivB64, "base64");
    const authTag = Buffer.from(authTagB64, "base64");
    const ciphertext = Buffer.from(cipherB64, "base64");
    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    // Wrong key (shouldn't happen — same server, same derivation) or a
    // plaintext value that coincidentally has two colons — never let a
    // display field crash the request it's rendered in.
    return stored;
  }
}
