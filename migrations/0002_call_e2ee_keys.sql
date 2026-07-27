-- Phase C.3: media-frame E2EE pubkey exchange columns.
-- Two ephemeral X25519 public keys per call. Server is a dumb relay —
-- it never sees the private scalars, so it can't derive the shared
-- LiveKit frame-encryption key.
ALTER TABLE calls
  ADD COLUMN IF NOT EXISTS caller_e2ee_pubkey TEXT,
  ADD COLUMN IF NOT EXISTS receiver_e2ee_pubkey TEXT;
