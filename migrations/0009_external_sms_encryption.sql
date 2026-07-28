-- External SMS at-rest hardening.
-- Adds isEncrypted so readers can tell "body is an AES-256-GCM blob"
-- (server/smsEncryption.ts) from pre-existing genuinely-plaintext rows.
ALTER TABLE external_sms
  ADD COLUMN IF NOT EXISTS is_encrypted boolean NOT NULL DEFAULT false;
