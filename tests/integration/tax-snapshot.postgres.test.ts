import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const adminUrl = process.env.TEST_DATABASE_URL;
const runtimeUrl = process.env.TEST_RUNTIME_DATABASE_URL;
const integrationDescribe = adminUrl && runtimeUrl ? describe : describe.skip;
const tenantA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const tenantB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

type SnapshotInput = {
  tenantId: string;
  documentId?: string;
  version?: number;
};

function snapshotValues(input: SnapshotInput) {
  return [
    input.tenantId,
    "INVOICE",
    input.documentId ?? randomUUID(),
    input.version ?? 1,
    "TAX_EXCLUSIVE_HALF_UP_V1",
    "integration-test",
    "2026-10-16",
    "XOF",
    0,
    JSON.stringify({ net: "1000" }),
    JSON.stringify({ tax: "180", total: "1180" }),
    JSON.stringify([{ ruleCode: "BJ_VAT_STANDARD", ratePercent: "18" }]),
    randomUUID(),
  ];
}

async function insertSnapshot(client: PoolClient, input: SnapshotInput): Promise<string> {
  const values = snapshotValues(input);
  const result = await client.query<{ id: string }>(
    `INSERT INTO public.finance_tax_calculation_snapshots
      (tenant_id, document_type, document_id, document_version, calculation_policy,
       engine_version, tax_date, currency_code, currency_minor_unit, input_snapshot,
       result_snapshot, applied_rules_snapshot, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb, $13)
     RETURNING id`,
    values,
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error("Snapshot INSERT returned no ID");
  return id;
}

async function inTenant(client: PoolClient, tenantId: string): Promise<void> {
  await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
}

async function expectSqlState(work: () => Promise<unknown>, code: string): Promise<void> {
  let caught: unknown;
  try {
    await work();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeDefined();
  expect((caught as { code?: string }).code).toBe(code);
}

integrationDescribe("PostgreSQL tax snapshot security", () => {
  let adminPool: Pool;
  let runtimePool: Pool;

  beforeAll(() => {
    adminPool = new Pool({ connectionString: adminUrl, max: 2 });
    runtimePool = new Pool({ connectionString: runtimeUrl, max: 3 });
  });

  afterAll(async () => {
    await Promise.all([adminPool?.end(), runtimePool?.end()]);
  });

  it("uses a runtime role that cannot bypass RLS or mutate snapshots by table grants", async () => {
    const result = await runtimePool.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
      "SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user",
    );
    expect(result.rows[0]?.rolsuper).toBe(false);
    expect(result.rows[0]?.rolbypassrls).toBe(false);

    const grants = await runtimePool.query<{ privilege: string }>(
      `SELECT privilege_type AS privilege
         FROM information_schema.role_table_grants
        WHERE grantee = current_user
          AND table_schema = 'public'
          AND table_name = 'finance_tax_calculation_snapshots'`,
    );
    const privileges = grants.rows.map((row) => row.privilege);
    expect(privileges).toContain("SELECT");
    expect(privileges).toContain("INSERT");
    expect(privileges).not.toContain("UPDATE");
    expect(privileges).not.toContain("DELETE");
  });

  it("isolates reads to the tenant transaction context", async () => {
    const client = await runtimePool.connect();
    try {
      await client.query("BEGIN");
      await inTenant(client, tenantA);
      const id = await insertSnapshot(client, { tenantId: tenantA });
      const own = await client.query(
        "SELECT id FROM public.finance_tax_calculation_snapshots WHERE id = $1",
        [id],
      );
      const foreign = await client.query(
        "SELECT id FROM public.finance_tax_calculation_snapshots WHERE tenant_id = $1",
        [tenantB],
      );
      expect(own.rowCount).toBe(1);
      expect(foreign.rowCount).toBe(0);
      await client.query("ROLLBACK");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });

  it("rejects inserting another tenant's snapshot under the current tenant context", async () => {
    const client = await runtimePool.connect();
    try {
      await client.query("BEGIN");
      await inTenant(client, tenantA);
      await expectSqlState(() => insertSnapshot(client, { tenantId: tenantB }), "42501");
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  });

  it("fails closed when tenant context is absent", async () => {
    const client = await runtimePool.connect();
    try {
      await client.query("BEGIN");
      const visible = await client.query("SELECT id FROM public.finance_tax_calculation_snapshots");
      expect(visible.rowCount).toBe(0);
      await expectSqlState(() => insertSnapshot(client, { tenantId: tenantA }), "42501");
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  });

  it("rejects duplicate tenant/document/version snapshots", async () => {
    const client = await runtimePool.connect();
    try {
      await client.query("BEGIN");
      await inTenant(client, tenantA);
      const documentId = randomUUID();
      await insertSnapshot(client, { tenantId: tenantA, documentId, version: 1 });
      await client.query("SAVEPOINT duplicate_snapshot");
      await expectSqlState(
        () => insertSnapshot(client, { tenantId: tenantA, documentId, version: 1 }),
        "23505",
      );
      await client.query("ROLLBACK TO SAVEPOINT duplicate_snapshot");
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  });

  it("blocks runtime UPDATE and DELETE privileges", async () => {
    const client = await runtimePool.connect();
    try {
      await client.query("BEGIN");
      await inTenant(client, tenantA);
      const id = await insertSnapshot(client, { tenantId: tenantA });
      await client.query("SAVEPOINT update_snapshot");
      await expectSqlState(
        () => client.query("UPDATE public.finance_tax_calculation_snapshots SET engine_version = 'tampered' WHERE id = $1", [id]),
        "42501",
      );
      await client.query("ROLLBACK TO SAVEPOINT update_snapshot");
      await client.query("SAVEPOINT delete_snapshot");
      await expectSqlState(
        () => client.query("DELETE FROM public.finance_tax_calculation_snapshots WHERE id = $1", [id]),
        "42501",
      );
      await client.query("ROLLBACK TO SAVEPOINT delete_snapshot");
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  });

  it("enforces the immutable trigger even for the database owner", async () => {
    const client = await adminPool.connect();
    try {
      await client.query("BEGIN");
      const id = await insertSnapshot(client, { tenantId: tenantA });
      await client.query("SAVEPOINT immutable_update");
      await expectSqlState(
        () => client.query("UPDATE public.finance_tax_calculation_snapshots SET engine_version = 'tampered' WHERE id = $1", [id]),
        "55000",
      );
      await client.query("ROLLBACK TO SAVEPOINT immutable_update");
      await client.query("SAVEPOINT immutable_delete");
      await expectSqlState(
        () => client.query("DELETE FROM public.finance_tax_calculation_snapshots WHERE id = $1", [id]),
        "55000",
      );
      await client.query("ROLLBACK TO SAVEPOINT immutable_delete");
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  });
});
