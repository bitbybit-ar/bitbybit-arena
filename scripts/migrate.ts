import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { sql } from "drizzle-orm";

config({ path: ".env.local" });
config({ path: ".env" });

const MIGRATIONS_FOLDER = "./drizzle";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }
  const client = neon(databaseUrl);
  const db = drizzle(client);
  await baselineIfNeeded(db);
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  console.log("Migrations applied");
}

// If the schema already exists (e.g. created by a prior `drizzle-kit push` or
// manual setup) but drizzle's bookkeeping table is missing some rows, the
// migrator would try to re-run 0000 and crash on "relation already exists".
// Baseline the journal so drizzle treats those migrations as already applied.
//
// Self-healing: instead of short-circuiting when the table already has *any*
// rows, we iterate every migration in the folder and insert a row for each
// one that has no matching hash. This survives partial/corrupted state left
// behind by previous failed runs (a row with NULL/0 created_at, a row for
// an unrelated migration, etc.).
async function baselineIfNeeded(db: NeonHttpDatabase): Promise<void> {
  const schemaExists = await hasUsersTable(db);
  if (!schemaExists) {
    console.log("Baseline: no existing schema, skipping");
    return;
  }

  await db.execute(sql`CREATE SCHEMA IF NOT EXISTS drizzle`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `);

  const { rows: existing } = await db.execute<{ hash: string; created_at: string | number | null }>(
    sql`SELECT hash, created_at FROM drizzle.__drizzle_migrations`,
  );
  const knownHashes = new Set(existing.map((r) => r.hash));

  const migrations = readMigrationFiles({ migrationsFolder: MIGRATIONS_FOLDER });
  let inserted = 0;
  for (const m of migrations) {
    if (knownHashes.has(m.hash)) continue;
    await db.execute(
      sql`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES (${m.hash}, ${m.folderMillis})`,
    );
    inserted += 1;
  }

  // A prior failed run may have left a row with NULL or 0 created_at that
  // would still be "< folderMillis" to the migrator and trigger a re-run.
  // Patch any such rows to the correct folderMillis by matching hash.
  for (const m of migrations) {
    await db.execute(sql`
      UPDATE drizzle.__drizzle_migrations
      SET created_at = ${m.folderMillis}
      WHERE hash = ${m.hash}
        AND (created_at IS NULL OR created_at < ${m.folderMillis})
    `);
  }

  console.log(
    `Baseline: ${migrations.length} migration(s) in folder, ${existing.length} pre-existing row(s), ${inserted} inserted`,
  );
}

async function hasUsersTable(db: NeonHttpDatabase): Promise<boolean> {
  const { rows } = await db.execute<{ exists: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'users'
    ) AS "exists"
  `);
  return Boolean(rows[0]?.exists);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});