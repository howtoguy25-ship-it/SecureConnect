-- Phase: VN Recycling (30-day quarantine).
-- When a user releases their SecureConnect number, the row is kept in our pool
-- with status='released' and `recyclable_at = now() + 30 days`. The Twilio
-- number itself is NOT released back to the global pool — keeping it in our
-- Twilio account is the whole point of the quarantine, otherwise stale SMS /
-- 2FA codes addressed to that E.164 would still reach a new global owner.
-- After `recyclable_at` passes, the row is eligible for reassignment to a new
-- SecureConnect user during their next /provision call (same E.164, same
-- twilio_sid, fresh assignedUserId).

ALTER TABLE virtual_numbers
  ADD COLUMN IF NOT EXISTS recyclable_at TIMESTAMP;

-- Backfill: any existing 'released' rows are immediately recyclable. They
-- predate this feature and shouldn't be quarantined retroactively (no
-- assigned-user-data risk because they were released the old way, which
-- also released them at Twilio).
UPDATE virtual_numbers
SET recyclable_at = now()
WHERE status = 'released' AND recyclable_at IS NULL;

-- Index: lookups during /provision filter by (status='released', country,
-- recyclable_at <= now()). A partial index keeps the working set tiny since
-- the active assigned rows are the bulk of the table.
CREATE INDEX IF NOT EXISTS idx_vn_recyclable
  ON virtual_numbers (country_code, recyclable_at)
  WHERE status = 'released';
