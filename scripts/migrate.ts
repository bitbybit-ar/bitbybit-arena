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
// journal so drizzle treats those migrations as already applied.
async function baselineIfNeeded(db: NeonHttpDatabase): Promise<void> {
  const schemaExists = await hasUsersTable(db);
  if (!schemaExists) return;

  await db.execute(sql`CREATE SCHEMA IF NOT EXISTS drizzle`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `);

  const { rows: countRows } = await db.execute<{ count: number }>(
    sql`SELECT COUNT(*)::int AS count FROM drizzle.__drizzle_migrations`,
  );
  if ((countRows[0]?.count ?? 0) > 0) return;

  const migrations = readMigrationFiles({ migrationsFolder: MIGRATIONS_FOLDER });
  for (const m of migrations) {
    await db.execute(
      sql`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES (${m.hash}, ${m.folderMillis})`,
    );
  }
  console.log(`Baselined ${migrations.length} existing migration(s)`);
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