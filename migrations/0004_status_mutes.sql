-- Status mutes: viewer-controlled hide of another user's stories from the feed.
-- Symmetric to userBlocks but scoped to the status feed only — the muted user
-- can still message, call, and view the muter's stories normally; they just
-- stop appearing in the muter's "Recent Updates" list.
CREATE TABLE IF NOT EXISTS "status_mutes" (
  "muter_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "muted_user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamp DEFAULT now(),
  PRIMARY KEY ("muter_id", "muted_user_id")
);

CREATE INDEX IF NOT EXISTS "idx_status_mutes_muter" ON "status_mutes" ("muter_id");
