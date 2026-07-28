import crypto from "crypto";

// At-rest protection for `external_sms.body`. Carrier SMS can never be true
// E2EE — the carrier network and Twilio already see it in plaintext before
// it reaches us — but there is no reason a copy should then sit readable in
// our own database (a personal 2FA code, a bank alert, etc. is still
// sensitive even though it's not end-to-end encrypted). This encrypts the
// body with a server-held key before it's written, so a database dump/leak
// or an internal query can't recover the content without the key.
//
// Follows the same fail-closed-in-production / dev-fallback pattern as
// JWT_SECRET in routes.ts: a real deployment must set SMS_ENCRYPTION_KEY,
// local dev can proceed without one.
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

const ENCRYPTION_KEY: Buffer = (() => {
  const fromEnv = process.env.SMS_ENCRYPTION_KEY;
  if (fromEnv) {
    // Accept a 32-byte key supplied as base64, hex, or raw utf8 — derive a
    // fixed 32-byte key via SHA-256 either way so operators don't have to
    // get the encoding exactly right.
    return crypto.createHash("sha256").update(fromEnv).digest();
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SMS_ENCRYPTION_KEY is required in production to encrypt stored SMS content. " +
      "Set it in the deployment environment variables before booting.",
    );
  }
  return crypto.createHash("sha256").update("pryvo-sms-dev-only-key-do-not-use-in-prod").digest();
})();

// Stored format: base64(iv[12] || authTag[16] || ciphertext). Single column,
// no schema change needed beyond the isEncrypted flag that tells old
// (pre-encryption) plaintext rows apart from new ones.
export function encryptSmsBody(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

export function decryptSmsBody(stored: string): string {
  const raw = Buffer.from(stored, "base64");
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + 16);
  const ciphertext = raw.subarray(IV_LENGTH + 16);
  const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
