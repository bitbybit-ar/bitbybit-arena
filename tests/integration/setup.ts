// IMPORTANT: every test file that imports from this module must declare
// `@vitest-environment node` in a top-of-file docblock. The global vitest
// environment is jsdom (for component tests), but @neondatabase/serverless
// detects `window` and prints a browser-SQL warning if loaded under jsdom.
import { config } from "dotenv";
import { resolve } from "path";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
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
  // Delete in FK-safe order (children first, parents last)
  await testDb.delete(schema.notifications);
  await testDb.delete(schema.badges);
  await testDb.delete(schema.checkpoint_completions);
  await testDb.delete(schema.challenge_checkpoints);
  await testDb.delete(schema.completions);
  await testDb.delete(schema.participants);
  await testDb.delete(schema.challenges);
  await testDb.delete(schema.users);
}
