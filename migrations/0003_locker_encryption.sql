-- Locker encryption-at-rest (Phase 1)
-- Adds the columns the new client/server crypto path needs.
-- Existing rows keep their (content, media_url) plaintext columns until the
-- user migrates them on next unlock; new rows write only ciphertext/nonce
-- and set encrypted_v2=true.
ALTER TABLE hidden_locker_items
  ADD COLUMN IF NOT EXISTS ciphertext text,
  ADD COLUMN IF NOT EXISTS nonce text,
  ADD COLUMN IF NOT EXISTS encrypted_v2 boolean NOT NULL DEFAULT false;

-- Per-user salt for client-side scrypt KDF.  Salts are non-secret by
-- definition; storing server-side lets the user unlock from any device with
-- their PIN.  The salt alone proves nothing — the PIN is still required to
-- derive the master key.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS locker_salt text,
  ADD COLUMN IF NOT EXISTS locker_failed_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locker_locked_until timestamp;
