import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool } from "pg";

interface SeedTenant {
  id: string;
  tenant_code: string;
  legal_name: string;
  country_code: string;
  default_currency: string;
  status: string;
}

interface SeedCurrency {
  code: string;
  name: string;
  minor_unit: number;
  is_active: boolean;
  source: string;
}

interface IntegrationSeedManifest {
  schemaVersion: number;
  purpose: string;
  tenants: SeedTenant[];
  currencies: SeedCurrency[];
}

const connectionString = process.env["DATABASE_URL"];
if (!connectionString) throw new Error("DATABASE_URL is required for integration setup");

// This script creates roles and writes seed rows. Protect it from accidental use
// against a remote Supabase or production database; CI uses localhost/finance_test.
const databaseUrl = new URL(connectionString);
const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1"]);
const databaseName = databaseUrl.pathname.replace(/^\//, "");
if (!loopbackHosts.has(databaseUrl.hostname) || databaseName !== "finance_test") {
  throw new Error(
    "Refusing to prepare integration fixtures unless DATABASE_URL targets a loopback host and database finance_test.",
  );
}

const manifestPath = resolve(process.cwd(), "tests/fixtures/integration-seed-manifest.json");
const runtimePassword = process.env["TEST_RUNTIME_PASSWORD"];
if (!runtimePassword || runtimePassword.length < 20) {
  throw new Error("TEST_RUNTIME_PASSWORD must be at least 20 characters");
}

function validateManifest(value: unknown): IntegrationSeedManifest {
  if (!value || typeof value !== "object") throw new Error("Integration seed manifest must be a JSON object");
  const manifest = value as Partial<IntegrationSeedManifest>;
  if (manifest.schemaVersion !== 1) throw new Error("Unsupported integration seed manifest schemaVersion");
  if (typeof manifest.purpose !== "string" || !manifest.purpose.includes("disposable")) {
    throw new Error("Integration seed manifest must explicitly state its disposable-test purpose");
  }
  if (!Array.isArray(manifest.tenants) || manifest.tenants.length < 2) {
    throw new Error("Integration seed manifest must define at least two tenants");
  }
  if (!Array.isArray(manifest.currencies) || manifest.currencies.length === 0) {
    throw new Error("Integration seed manifest must define at least one currency");
  }

  const tenantIds = new Set<string>();
  const tenantCodes = new Set<string>();
  for (const tenant of manifest.tenants) {
    if (
      !tenant ||
      typeof tenant.id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tenant.id) ||
      typeof tenant.tenant_code !== "string" ||
      !/^ITEST_[A-Z0-9]+$/.test(tenant.tenant_code) ||
      typeof tenant.legal_name !== "string" ||
      tenant.country_code !== "BJ" ||
      tenant.default_currency !== "XOF" ||
      tenant.status !== "ACTIVE"
    ) {
      throw new Error("Invalid integration tenant fixture; tenant codes must remain in the ITEST_ namespace");
    }
    if (tenantIds.has(tenant.id) || tenantCodes.has(tenant.tenant_code)) {
      throw new Error("Integration seed manifest contains duplicate tenant IDs or codes");
    }
    tenantIds.add(tenant.id);
    tenantCodes.add(tenant.tenant_code);
  }

  const currencyCodes = new Set<string>();
  for (const currency of manifest.currencies) {
    if (
      !currency ||
      typeof currency.code !== "string" ||
      !/^[A-Z]{3}$/.test(currency.code) ||
      typeof currency.name !== "string" ||
      !Number.isInteger(currency.minor_unit) ||
      currency.minor_unit < 0 ||
      currency.minor_unit > 4 ||
      typeof currency.is_active !== "boolean" ||
      currency.source !== "INTEGRATION_TEST"
    ) {
      throw new Error("Invalid integration currency fixture; source must remain INTEGRATION_TEST");
    }
    if (currencyCodes.has(currency.code)) throw new Error("Duplicate currency in integration seed manifest");
    currencyCodes.add(currency.code);
  }

  return manifest as IntegrationSeedManifest;
}

async function prepare(): Promise<void> {
  const rawManifest = await readFile(manifestPath, "utf8");
  const manifest = validateManifest(JSON.parse(rawManifest) as unknown);
  const pool = new Pool({ connectionString, max: 2 });
  const client = await pool.connect();
  try {
    const database = await client.query<{ current_database: string; current_user: string }>(
      "SELECT current_database(), current_user",
    );
    if (database.rows[0]?.current_database !== "finance_test") {
      throw new Error("Refusing to seed: connected database is not finance_test");
    }

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

    await client.query("GRANT CONNECT ON DATABASE finance_test TO finance_runtime_test");
    await client.query("GRANT USAGE ON SCHEMA public TO finance_runtime_test");
    await client.query("GRANT SELECT ON public.finance_tenants, public.finance_currencies, public.finance_customers TO finance_runtime_test");
    await client.query("GRANT INSERT, SELECT ON public.finance_tax_calculation_snapshots TO finance_runtime_test");
    await client.query("GRANT SELECT, INSERT ON public.finance_invoices, public.finance_invoice_lines TO finance_runtime_test");

    await client.query("REVOKE ALL ON TABLE public.finance_user_tenant_memberships FROM finance_runtime_test");
    await client.query("REVOKE ALL ON TABLE public.finance_user_tenant_memberships FROM PUBLIC");

    for (const tenant of manifest.tenants) {
      await client.query(
        `INSERT INTO public.finance_tenants
          (id, tenant_code, legal_name, country_code, default_currency, status)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET
           tenant_code = EXCLUDED.tenant_code,
           legal_name = EXCLUDED.legal_name,
           country_code = EXCLUDED.country_code,
           default_currency = EXCLUDED.default_currency,
           status = EXCLUDED.status`,
        [tenant.id, tenant.tenant_code, tenant.legal_name, tenant.country_code, tenant.default_currency, tenant.status],
      );
    }

    for (const currency of manifest.currencies) {
      await client.query(
        `INSERT INTO public.finance_currencies (code, name, minor_unit, is_active, source)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (code) DO UPDATE SET
           name = EXCLUDED.name,
           minor_unit = EXCLUDED.minor_unit,
           is_active = EXCLUDED.is_active,
           source = EXCLUDED.source`,
        [currency.code, currency.name, currency.minor_unit, currency.is_active, currency.source],
      );
    }

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
    const membershipGrants = grants.rows[0] as Record<string, boolean> | undefined;
    if (
      membershipGrants?.["can_select"] !== false ||
      membershipGrants["can_insert"] !== false ||
      membershipGrants["can_update"] !== false ||
      membershipGrants["can_delete"] !== false ||
      membershipGrants["can_truncate"] !== false ||
      membershipGrants["can_references"] !== false ||
      membershipGrants["can_trigger"] !== false ||
      membershipGrants["schema_usage"] !== true ||
      membershipGrants["schema_create"] !== false
    ) {
      throw new Error("Runtime database grants do not satisfy least-privilege membership policy");
    }

    process.stdout.write(
      `Prepared ${manifest.tenants.length} tenant fixtures and ${manifest.currencies.length} currency fixtures from ${manifestPath}; runtime grants verified.\n`,
    );
  } finally {
    client.release();
    await pool.end();
  }
}

prepare().catch((error: unknown) => {
  process.stderr.write(`Integration DB setup failed: ${error instanceof Error ? error.message : "unknown error"}\n`);
  process.exitCode = 1;
});
