import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

// Safety net for the `users` columns backing Account ID + security-question
// recovery. The Render preDeployCommand (`drizzle-kit push --force`) should
// already keep the live schema in sync, but push can no-op in a
// non-interactive deploy shell without failing the deploy outright, which
// silently leaves these columns missing while the already-deployed app code
// keeps selecting them — turning every `db.select().from(users)` (i.e. every
// authenticated request) into a hard 500. All statements are idempotent, so
// running this on every boot is safe even once push has caught up for real.
export async function ensureUserRecoverySchema(): Promise<void> {
  try {
    await pool.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS safe_code_lookup_hash text,
        ADD COLUMN IF NOT EXISTS security_q1_hash text,
        ADD COLUMN IF NOT EXISTS security_q2_hash text,
        ADD COLUMN IF NOT EXISTS security_questions_set_at timestamp,
        ADD COLUMN IF NOT EXISTS security_q_failed_attempts integer DEFAULT 0,
        ADD COLUMN IF NOT EXISTS security_q_locked_until timestamp;
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS users_safe_code_lookup_hash_unique
        ON users (safe_code_lookup_hash);
    `);
    // Same class of incident as above, this time for the Apple/Google
    // sign-in columns: `drizzle-kit push --force` in the Render
    // preDeployCommand silently didn't add these, and every verify-code
    // request (i.e. every login) started 500ing on
    // `column "apple_user_id" does not exist`.
    await pool.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS apple_user_id text,
        ADD COLUMN IF NOT EXISTS google_user_id text;
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS users_apple_user_id_unique
        ON users (apple_user_id);
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS users_google_user_id_unique
        ON users (google_user_id);
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key text PRIMARY KEY,
        value text NOT NULL,
        updated_at timestamp DEFAULT now()
      );
    `);
    // 'accepted' default backfills any pre-existing rows (none of the old
    // client code ever actually wrote to this table, but this is safe either
    // way); new pending-request rows explicitly set status='pending' at
    // insert time, overriding the column default.
    await pool.query(`
      ALTER TABLE friends
        ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'accepted';
    `);
    // Backing store for the "Save" hold-menu action — per-user, per-message,
    // so it survives reinstalls/new devices instead of living only in local
    // AsyncStorage. Deliberately NOT shared with the other party: saving is
    // a personal bookmark, not a conversation-wide state like Pin.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS message_saves (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        message_id varchar NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        created_at timestamp DEFAULT now(),
        UNIQUE (user_id, message_id)
      );
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS message_saves_user_id_idx ON message_saves (user_id);
    `);
    // Chat mute + "keep muted chats archived" (build 133): same
    // push-can-silently-no-op risk as every other column added here.
    await pool.query(`
      ALTER TABLE conversation_participants
        ADD COLUMN IF NOT EXISTS is_muted boolean DEFAULT false;
    `);
    await pool.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS keep_muted_chats_archived boolean DEFAULT false;
    `);
    // Username / @handle (build 133).
    await pool.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS username text,
        ADD COLUMN IF NOT EXISTS last_username_change_at timestamp;
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique ON users (username);
    `);
    // Locked Chats (build 133): per-chat lock flag + a separate chat-lock
    // PIN from Hidden Locker's.
    await pool.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS chat_lock_pin_hash text,
        ADD COLUMN IF NOT EXISTS chat_lock_failed_attempts integer DEFAULT 0,
        ADD COLUMN IF NOT EXISTS chat_lock_locked_until timestamp;
    `);
    await pool.query(`
      ALTER TABLE conversation_participants
        ADD COLUMN IF NOT EXISTS is_locked boolean DEFAULT false;
    `);
    // Payment link-out identifiers (build 133) — receive-only, no custody.
    await pool.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS payment_paypal_me_handle text,
        ADD COLUMN IF NOT EXISTS payment_pay_id text,
        ADD COLUMN IF NOT EXISTS payment_btc_address text;
    `);
    // Real-time "Active Now" presence toggle (build 133).
    await pool.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS show_active_status boolean DEFAULT true;
    `);
  } catch (error) {
    console.error('ensureUserRecoverySchema failed (server will still start, but auth may 500 until this is fixed):', error);
  }
}
