import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env["TEST_DATABASE_URL"];
const integrationDescribe = databaseUrl ? describe : describe.skip;

interface TenantScopedTable {
  table_name: string;
  rls_enabled: boolean;
  rls_forced: boolean;
  policy_count: number;
}

integrationDescribe("M03 tenant isolation catalog guard", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = new Pool({ connectionString: databaseUrl, max: 2 });
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("requires RLS, FORCE RLS and an explicit policy on every Finance table with tenant_id", async () => {
    const result = await pool.query<TenantScopedTable>(`
      SELECT c.relname AS table_name,
             c.relrowsecurity AS rls_enabled,
             c.relforcerowsecurity AS rls_forced,
             COUNT(p.policyname)::int AS policy_count
        FROM pg_class AS c
        JOIN pg_namespace AS n ON n.oid = c.relnamespace
        JOIN information_schema.columns AS col
          ON col.table_schema = n.nspname
         AND col.table_name = c.relname
         AND col.column_name = 'tenant_id'
        LEFT JOIN pg_policies AS p
          ON p.schemaname = n.nspname
         AND p.tablename = c.relname
       WHERE n.nspname = 'public'
         AND c.relkind IN ('r', 'p')
         AND c.relname LIKE 'finance_%'
       GROUP BY c.relname, c.relrowsecurity, c.relforcerowsecurity
       ORDER BY c.relname
    `);

    expect(result.rows.length, "Finance tenant-scoped tables must be discovered").toBeGreaterThan(0);

    const violations = result.rows
      .filter((table) => !table.rls_enabled || !table.rls_forced || table.policy_count === 0)
      .map((table) => ({
        table: table.table_name,
        rlsEnabled: table.rls_enabled,
        rlsForced: table.rls_forced,
        policyCount: table.policy_count,
      }));

    expect(
      violations,
      "Every Finance table carrying tenant_id must enable and force RLS and define an explicit policy",
    ).toEqual([]);
  });
});
