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
// manual setup) but drizzle's bookkeeping table is empty, the migrator would
// try to re-run 0000 and crash on "relation already exists". Baseline the
// journal once so drizzle treats those migrations as already applied.
//
// This ONLY runs on the very first migrate call against a pre-existing
// schema. Once the journal has any rows, we trust drizzle's migrator to
// apply any new migration files. Previously this loop inserted a row for
// every unknown hash on every run, which silently marked brand-new
// migrations as "applied" without executing their SQL.
//
// The second pass still patches any legacy row whose created_at was written
// as NULL/0 by an interrupted baseline, which would otherwise keep
// re-triggering a migrator run.
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

  const migrations = readMigrationFiles({ migrationsFolder: MIGRATIONS_FOLDER });

  if (existing.length === 0) {
    // First run against a pre-existing schema: baseline every migration in
    // the folder so the migrator does not try to re-create existing tables.
    for (const m of migrations) {
      await db.execute(
        sql`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES (${m.hash}, ${m.folderMillis})`,
      );
    }
    console.log(
      `Baseline: first run, baselined ${migrations.length} migration(s) into empty journal`,
    );
    return;
  }

  // Journal is non-empty: do NOT insert rows for unknown migration hashes.
  // New migrations must go through drizzle's migrator so their SQL actually
  // runs. We only repair legacy rows with NULL/0 created_at.
  let repaired = 0;
  for (const m of migrations) {
    const { rows } = await db.execute<{ id: number }>(sql`
      UPDATE drizzle.__drizzle_migrations
      SET created_at = ${m.folderMillis}
      WHERE hash = ${m.hash}
        AND (created_at IS NULL OR created_at < ${m.folderMillis})
      RETURNING id
    `);
    repaired += rows.length;
  }

  console.log(
    `Baseline: journal has ${existing.length} row(s); repaired ${repaired} stale created_at value(s); new migrations will be applied by the migrator`,
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