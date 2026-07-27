-- Stories/Status E2EE (Phase 1)
-- Adds the columns for encrypted stories on closed-audience privacy modes
-- (contacts / except / only, and the per-post friends/custom override).
-- 'everyone'-mode stories stay on the existing plaintext columns — the
-- audience there is unbounded (any user on the platform), so there is no
-- fixed recipient set to encrypt to; isEncrypted=false marks those rows.
ALTER TABLE statuses
  ADD COLUMN IF NOT EXISTS is_encrypted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS encrypted_caption text,
  ADD COLUMN IF NOT EXISTS caption_nonce text,
  ADD COLUMN IF NOT EXISTS media_key_wraps jsonb;
