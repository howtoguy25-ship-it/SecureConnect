-- VN Recycling safety patch (follow-up to 0005).
--
-- 1) The 0005 backfill set `recyclable_at = now()` for ALL pre-existing
--    `status='released'` rows. That is unsafe: those rows were released
--    under the OLD flow, which also called Twilio's releasePhoneNumber.
--    The E.164 is no longer in our Twilio account — recycling it would
--    point a new user at a number we cannot send or receive on (and
--    potentially owned by an unrelated party). We retroactively mark
--    those rows as non-recyclable by setting `recyclable_at = NULL`.
--    `getRecyclableNumber`'s `recyclableAt <= now()` filter excludes
--    NULL automatically (SQL three-valued logic), so these rows are now
--    permanently parked.
--
--    Heuristic: rows whose `released_at` is OLDER than this migration's
--    runtime cannot have gone through the new flow yet (which always
--    stamps `recyclable_at = released_at + 30d`, never `now()`). Any
--    row where `recyclable_at = released_at` (≈ now()) is a 0005 backfill
--    artifact and should be nulled. We also catch rows where releasedAt
--    is unset.
--    Deterministic approach: this migration runs BEFORE the new
--    `releaseVirtualNumber` flow is deployed (the new code lands in the
--    same release as this migration). Therefore every row currently in
--    `status='released'` MUST have come from the OLD flow — which means
--    the E.164 was already released back to Twilio's global pool and is
--    no longer in our account. Unconditionally null out `recyclable_at`
--    for ALL existing released rows so none of them can ever be recycled.
--    `getRecyclableNumber`'s `recyclable_at <= now()` filter excludes
--    NULL via SQL three-valued logic, so these rows are permanently
--    parked. From this migration forward, the only path that sets
--    `recyclable_at` is the new `releaseVirtualNumber`, which keeps the
--    number in our Twilio account.
UPDATE virtual_numbers
SET recyclable_at = NULL
WHERE status = 'released';

-- 2) Prior-owner correlation defense. Record who released the number so
--    we can refuse to hand it back to the same user during recycle. This
--    prevents the "release → wait 30d → re-provision and get my old
--    number back" identity-correlation pattern.
ALTER TABLE virtual_numbers
  ADD COLUMN IF NOT EXISTS previous_assigned_user_id VARCHAR
    REFERENCES users(id) ON DELETE SET NULL;
