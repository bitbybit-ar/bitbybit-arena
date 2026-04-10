// IMPORTANT: every test file that imports from this module must declare
// `@vitest-environment node` in a top-of-file docblock. The global vitest
// environment is jsdom (for component tests), but @neondatabase/serverless
// detects `window` and prints a browser-SQL warning if loaded under jsdom.
import { config } from "dotenv";
import { resolve } from "path";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql } from "drizzle-orm";
import * as schema from "@/lib/db/schema";

// Load .env.test before anything else
config({ path: resolve(__dirname, "../../.env.test") });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL not set in .env.test");

const sqlClient = neon(databaseUrl);
export const testDb = drizzle(sqlClient, { schema });

/**
 * Truncate all tables in reverse FK order.
 * Call in beforeEach to guarantee a clean slate.
 */
export async function cleanDb() {
  // Single TRUNCATE with RESTART IDENTITY CASCADE handles every FK in
  // the schema in one round trip, avoids drizzle's per-table DELETE
  // overhead, and guarantees state is wiped even if a previous test
  // file left tangled references behind.
  await testDb.execute(
    sql`TRUNCATE TABLE notifications, badges, checkpoint_completions, challenge_checkpoints, completions, participants, challenges, users RESTART IDENTITY CASCADE`
  );
}
