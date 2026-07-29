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
  } catch (error) {
    console.error('ensureUserRecoverySchema failed (server will still start, but auth may 500 until this is fixed):', error);
  }
}
