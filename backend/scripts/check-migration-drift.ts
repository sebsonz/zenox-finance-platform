import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool } from "pg";
import {
  compareMigrationInventory,
  type AppliedMigration,
  type LocalMigration,
} from "./lib/migration-drift.js";

const connectionString = process.env["DATABASE_URL"];
if (!connectionString) {
  throw new Error("DATABASE_URL is required for the read-only migration drift audit");
}

const migrationsDir = resolve(process.cwd(), "../supabase/migrations");
const migrationFilename = /^\d{14}_[a-z0-9_-]+\.sql$/;

async function loadLocalMigrations(): Promise<LocalMigration[]> {
  const names = (await readdir(migrationsDir))
    .filter((name) => migrationFilename.test(name))
    .sort();
  return Promise.all(
    names.map(async (name) => ({
      name,
      sql: await readFile(resolve(migrationsDir, name), "utf8"),
    })),
  );
}

async function audit(): Promise<void> {
  const local = await loadLocalMigrations();
  const pool = new Pool({
    connectionString,
    max: 1,
    application_name: "zenox-finance-migration-drift-readonly",
  });
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    const database = await client.query<{
      current_database: string;
      current_user: string;
      migration_ledger: string | null;
    }>(`
      SELECT current_database(),
             current_user,
             to_regclass('public.finance_schema_migrations')::text AS migration_ledger
    `);
    const identity = database.rows[0];
    if (!identity) throw new Error("Could not identify the connected database");
    process.stdout.write(
      `Read-only Finance migration audit: database=${identity.current_database}, role=${identity.current_user}\n`,
    );
    if (!identity.migration_ledger) {
      throw new Error(
        "public.finance_schema_migrations is missing. No database changes were made; apply migrations only in the intended disposable/test environment, then rerun the audit.",
      );
    }

    const ledger = await client.query<AppliedMigration>(
      `SELECT name, checksum, applied_at::text AS applied_at
       FROM public.finance_schema_migrations
       ORDER BY name`,
    );
    const report = compareMigrationInventory(local, ledger.rows);
    process.stdout.write(
      `Migration inventory: repository=${report.localCount}, applied=${report.appliedCount}, pending=${report.pending.length}, drift_issues=${report.issues.length}\n`,
    );

    for (const issue of report.issues) {
      process.stderr.write(`DRIFT [${issue.code}] ${issue.message}\n`);
    }
    if (report.pending.length) {
      process.stdout.write("Pending local migrations (reported only; not applied by this command):\n");
      for (const name of report.pending) process.stdout.write(`  - ${name}\n`);
    }
    if (report.issues.length) {
      throw new Error("Migration drift audit failed; review the report before any database migration");
    }
    process.stdout.write("Migration drift audit passed; no applied-source mismatch or unknown applied migration found.\n");
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

audit().catch((error: unknown) => {
  process.stderr.write(`Migration drift audit failed: ${error instanceof Error ? error.message : "unknown error"}\n`);
  process.exitCode = 1;
});
