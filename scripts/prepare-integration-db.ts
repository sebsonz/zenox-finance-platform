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

    // Membership access is intentionally not granted to the general invoice runtime role.
    // Membership lifecycle changes must be implemented behind a separately reviewed admin service.
    await client.query("REVOKE ALL ON TABLE public.finance_user_tenant_memberships FROM finance_runtime_test");
    await client.query("REVOKE ALL ON TABLE public.finance_user_tenant_memberships FROM PUBLIC");

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
      `SELECT rolsuper, rolbypassrls, rolcreatedb, rolcreaterole
       FROM pg_roles WHERE rolname = 'finance_runtime_test'`,
    );
    const role = roleCheck.rows[0] as
      | { rolsuper: boolean; rolbypassrls: boolean; rolcreatedb: boolean; rolcreaterole: boolean }
      | undefined;
    if (
      role?.rolsuper !== false ||
      role.rolbypassrls !== false ||
      role.rolcreatedb !== false ||
      role.rolcreaterole !== false
    ) {
      throw new Error("Integration role must be non-superuser, non-BYPASSRLS, and lack database/role creation privileges");
    }

    const grants = await client.query(`
      SELECT
        has_table_privilege('finance_runtime_test', 'public.finance_user_tenant_memberships', 'SELECT') AS can_select,
        has_table_privilege('finance_runtime_test', 'public.finance_user_tenant_memberships', 'INSERT') AS can_insert,
        has_table_privilege('finance_runtime_test', 'public.finance_user_tenant_memberships', 'UPDATE') AS can_update,
        has_table_privilege('finance_runtime_test', 'public.finance_user_tenant_memberships', 'DELETE') AS can_delete,
        has_table_privilege('finance_runtime_test', 'public.finance_user_tenant_memberships', 'TRUNCATE') AS can_truncate,
        has_table_privilege('finance_runtime_test', 'public.finance_user_tenant_memberships', 'REFERENCES') AS can_references,
        has_table_privilege('finance_runtime_test', 'public.finance_user_tenant_memberships', 'TRIGGER') AS can_trigger,
        has_schema_privilege('finance_runtime_test', 'public', 'USAGE') AS schema_usage,
        has_schema_privilege('finance_runtime_test', 'public', 'CREATE') AS schema_create
    `);
    const membershipGrants = grants.rows[0] as
      | Record<string, boolean>
      | undefined;
    if (
      membershipGrants?.can_select !== false ||
      membershipGrants.can_insert !== false ||
      membershipGrants.can_update !== false ||
      membershipGrants.can_delete !== false ||
      membershipGrants.can_truncate !== false ||
      membershipGrants.can_references !== false ||
      membershipGrants.can_trigger !== false ||
      membershipGrants.schema_usage !== true ||
      membershipGrants.schema_create !== false
    ) {
      throw new Error("Runtime database grants do not satisfy least-privilege membership policy");
    }

    process.stdout.write("Prepared isolated PostgreSQL integration role, tenant fixtures, and least-privilege checks.\n");
  } finally {
    client.release();
    await pool.end();
  }
}

prepare().catch((error: unknown) => {
  process.stderr.write(`Integration DB setup failed: ${error instanceof Error ? error.message : "unknown error"}\n`);
  process.exitCode = 1;
});
