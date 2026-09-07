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
    // Payment balance ledger (build 133) — same push-can-silently-no-op risk
    // as everything else here; confirmed live in production via
    // /api/payments/balance returning "relation \"payment_transactions\"
    // does not exist" after the app code had already deployed.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payment_transactions (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        counterparty_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        direction text NOT NULL,
        method text NOT NULL,
        amount_minor_units integer NOT NULL,
        currency text NOT NULL,
        note text,
        created_at timestamp DEFAULT now()
      );
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_payment_tx_user_id ON payment_transactions (user_id);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_payment_tx_counterparty_id ON payment_transactions (counterparty_id);
    `);
    // Real money movement via Stripe Connect (build 134).
    await pool.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS stripe_connect_account_id text,
        ADD COLUMN IF NOT EXISTS stripe_connect_payouts_enabled boolean DEFAULT false;
    `);
    await pool.query(`
      ALTER TABLE payment_transactions
        ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text;
    `);
    // Owner-panel sign-in status tracking (build 135) — see the field
    // comments in shared/schema.ts for what these actually represent
    // (best-effort, stateless-JWT auth has no real session to query).
    await pool.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS is_signed_in boolean DEFAULT false,
        ADD COLUMN IF NOT EXISTS last_sign_in_at timestamp,
        ADD COLUMN IF NOT EXISTS last_sign_out_at timestamp;
    `);
    // E2EE message reactions (build 135) — replaces the plaintext
    // messages.reactions jsonb column with per-user ciphertext rows. See
    // shared/schema.ts's messageReactions comment for the full design.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS message_reactions (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        message_id varchar NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        ciphertext text NOT NULL,
        encryption_version text NOT NULL,
        e2ee_init_envelope jsonb,
        created_at timestamp DEFAULT now()
      );
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_message_reactions_msg_user
        ON message_reactions (message_id, user_id);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_message_reactions_message_id ON message_reactions (message_id);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_message_reactions_user_id ON message_reactions (user_id);
    `);
    // Login metadata at rest (build 135) — device/platform/ip on
    // login_events are now stored encrypted with a server-held key
    // (pgcrypto-free: encryption happens in the app layer, see
    // encryptLoginField/decryptLoginField in server/loginMetadataCrypto.ts)
    // rather than plaintext. This is NOT end-to-end encryption — the server
    // can still decrypt it, same as before, for the concurrent-session-
    // hijack detection feature that has to compare these values. It
    // protects against a stolen database backup or raw-row DB access (an
    // insider, a leaked pg_dump) exposing IPs/devices in plaintext, which
    // the old column type did nothing to prevent. deviceId is left
    // plaintext — see loginMetadataCrypto.ts's header comment for why.
  } catch (error) {
    console.error('ensureUserRecoverySchema failed (server will still start, but auth may 500 until this is fixed):', error);
  }
}
