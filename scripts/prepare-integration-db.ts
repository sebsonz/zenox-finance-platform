import { Pool } from "pg";

const connectionString = process.env["DATABASE_URL"];
if (!connectionString) throw new Error("DATABASE_URL is required for integration setup");

const pool = new Pool({ connectionString, max: 2 });
const tenantA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const tenantB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const runtimePassword = process.env["TEST_RUNTIME_PASSWORD"];
if (!runtimePassword || runtimePassword.length < 20) {
  throw new Error("TEST_RUNTIME_PASSWORD must be at least 20 characters");
}

async function prepare(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      DO $role$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finance_runtime_test') THEN
          CREATE ROLE finance_runtime_test LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
        END IF;
      END
      $role$;
    `);
    const alterRole = await client.query<{ statement: string }>(
      "SELECT format('ALTER ROLE finance_runtime_test WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD %L', $1::text) AS statement",
      [runtimePassword],
    );
    const statement = alterRole.rows[0]?.statement;
    if (!statement) throw new Error("Could not prepare test role password");
    await client.query(statement);
    await client.query("GRANT CONNECT ON DATABASE finance_test TO finance_runtime_test").catch(async (error: unknown) => {
      // The database name may differ locally; connect privilege is commonly inherited from PUBLIC.
      const pgError = error as { code?: string };
      if (pgError.code !== "3D000") throw error;
    });
    await client.query("GRANT USAGE ON SCHEMA public TO finance_runtime_test");
    await client.query("GRANT SELECT ON public.finance_tenants, public.finance_currencies, public.finance_customers TO finance_runtime_test");
    await client.query("GRANT INSERT, SELECT ON public.finance_tax_calculation_snapshots TO finance_runtime_test");
    await client.query("GRANT SELECT, INSERT ON public.finance_invoices, public.finance_invoice_lines TO finance_runtime_test");

    await client.query(
      `INSERT INTO public.finance_tenants (id, tenant_code, legal_name, country_code, default_currency, status)
       VALUES ($1, 'ITEST_A', 'Integration Tenant A', 'BJ', 'XOF', 'ACTIVE'),
              ($2, 'ITEST_B', 'Integration Tenant B', 'BJ', 'XOF', 'ACTIVE')
       ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE'`,
      [tenantA, tenantB],
    );
    await client.query(
      `INSERT INTO public.finance_currencies (code, name, minor_unit, is_active, source)
       VALUES ('XOF', 'West African CFA franc', 0, true, 'INTEGRATION_TEST')
       ON CONFLICT (code) DO UPDATE SET minor_unit = EXCLUDED.minor_unit, is_active = true`,
    );

    const roleCheck = await client.query(
      "SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'finance_runtime_test'",
    );
    if (roleCheck.rows[0]?.rolsuper !== false || roleCheck.rows[0]?.rolbypassrls !== false) {
      throw new Error("Integration role must be non-superuser and must not bypass RLS");
    }
    process.stdout.write("Prepared isolated PostgreSQL integration role and fixtures.\n");
  } finally {
    client.release();
    await pool.end();
  }
}

prepare().catch((error: unknown) => {
  process.stderr.write(`Integration DB setup failed: ${error instanceof Error ? error.message : "unknown error"}\n`);
  process.exitCode = 1;
});
