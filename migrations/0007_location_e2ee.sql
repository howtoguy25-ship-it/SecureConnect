-- Live location sharing E2EE (Phase 1)
-- Adds the per-viewer encrypted-blob column. Legacy latitude/longitude
-- columns are left in place (unused by current clients going forward) so
-- old rows don't error on read.
ALTER TABLE location_shares
  ADD COLUMN IF NOT EXISTS encrypted_locations jsonb NOT NULL DEFAULT '{}'::jsonb;
