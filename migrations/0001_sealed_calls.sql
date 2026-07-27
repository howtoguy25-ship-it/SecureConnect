-- Phase C.1: sealed-call signaling.
-- Add the two columns that mirror sealed-sender semantics from `messages`
-- onto the `calls` table.

ALTER TABLE "calls"
  ADD COLUMN IF NOT EXISTS "sealed_call" boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS "outer_caller_virtual_number_id" varchar;

DO $$ BEGIN
  ALTER TABLE "calls"
    ADD CONSTRAINT "calls_outer_caller_virtual_number_id_virtual_numbers_id_fk"
    FOREIGN KEY ("outer_caller_virtual_number_id")
    REFERENCES "virtual_numbers"("id")
    ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
