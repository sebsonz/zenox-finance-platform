import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pool } from "../src/db/pool.js";

const migrationsDir = resolve(process.cwd(), "supabase/migrations");

async function migrate(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.finance_schema_migrations (
        name text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query("COMMIT");

    const files = (await readdir(migrationsDir))
      .filter((name) => /^\d{14}_[a-z0-9_-]+\.sql$/.test(name))
      .sort();

    for (const name of files) {
      const sql = await readFile(resolve(migrationsDir, name), "utf8");
      const { createHash } = await import("node:crypto");
      const checksum = createHash("sha256").update(sql).digest("hex");

      const check = await pool.query(
        "SELECT checksum FROM public.finance_schema_migrations WHERE name = $1",
        [name],
      );
      if (check.rowCount) {
        const existing = check.rows[0]?.checksum as string | undefined;
        if (existing !== checksum) {
          throw new Error(`Applied migration was modified: ${name}`);
        }
        continue;
      }

      // Each migration is applied atomically. A failed migration leaves no
      // success marker and stops the runner.
      const migrationClient = await pool.connect();
      try {
        await migrationClient.query("BEGIN");
        await migrationClient.query(sql);
        await migrationClient.query(
          "INSERT INTO public.finance_schema_migrations (name, checksum) VALUES ($1, $2)",
          [name, checksum],
        );
        await migrationClient.query("COMMIT");
        process.stdout.write(`Applied ${name}\n`);
      } catch (error) {
        await migrationClient.query("ROLLBACK");
        throw error;
      } finally {
        migrationClient.release();
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown migration error";
  process.stderr.write(`Migration failed: ${message}\n`);
  process.exitCode = 1;
});
