import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const adminUrl = process.env["TEST_DATABASE_URL"];
const runtimeUrl = process.env["TEST_RUNTIME_DATABASE_URL"];
const integrationDescribe = adminUrl && runtimeUrl ? describe : describe.skip;
const tenantA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const tenantB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

integrationDescribe("PostgreSQL tenant membership RLS and least privilege", () => {
  let adminPool: Pool;
  let runtimePool: Pool;

  beforeAll(() => {
    adminPool = new Pool({ connectionString: adminUrl, max: 2 });
    runtimePool = new Pool({ connectionString: runtimeUrl, max: 2 });
  });

  afterAll(async () => {
    await Promise.all([adminPool?.end(), runtimePool?.end()]);
  });

  it("uses a non-superuser runtime role that cannot bypass RLS", async () => {
    const client = await runtimePool.connect();
    try {
      const role = await client.query<{
        current_user: string;
        rolsuper: boolean;
        rolbypassrls: boolean;
        rolcreatedb: boolean;
        rolcreaterole: boolean;
      }>(`
        SELECT current_user,
               r.rolsuper,
               r.rolbypassrls,
               r.rolcreatedb,
               r.rolcreaterole
        FROM pg_roles r
        WHERE r.rolname = current_user
      `);
      expect(role.rowCount).toBe(1);
      expect(role.rows[0]?.rolsuper).toBe(false);
      expect(role.rows[0]?.rolbypassrls).toBe(false);
      expect(role.rows[0]?.rolcreatedb).toBe(false);
      expect(role.rows[0]?.rolcreaterole).toBe(false);
    } finally {
      client.release();
    }
  });

  it("enforces membership tenant isolation and fails closed without tenant context", async () => {
    const suffix = randomUUID();
    const identityIssuer = "https://auth.example.test";
    const subjectA = `user-a-${suffix}`;
    const subjectB = `user-b-${suffix}`;

    const admin = await adminPool.connect();
    try {
      await admin.query("BEGIN");
      await admin.query("SELECT set_config('app.tenant_id', $1, true)", [tenantA]);
      await admin.query(
        `INSERT INTO public.finance_user_tenant_memberships
          (tenant_id, identity_issuer, identity_subject, role_code, status, activated_at)
         VALUES ($1, $2, $3, 'OWNER', 'ACTIVE', now())`,
        [tenantA, identityIssuer, subjectA],
      );
      await admin.query("COMMIT");

      await admin.query("BEGIN");
      await admin.query("SELECT set_config('app.tenant_id', $1, true)", [tenantB]);
      await admin.query(
        `INSERT INTO public.finance_user_tenant_memberships
          (tenant_id, identity_issuer, identity_subject, role_code, status, activated_at)
         VALUES ($1, $2, $3, 'VIEWER', 'ACTIVE', now())`,
        [tenantB, identityIssuer, subjectB],
      );
      await admin.query("COMMIT");
    } catch (error) {
      await admin.query("ROLLBACK");
      throw error;
    } finally {
      admin.release();
    }

    // Run as the limited runtime role with SELECT granted only inside this
    // disposable test transaction, so this assertion measures RLS rather than
    // failing early with "permission denied". The transaction rollback removes
    // the temporary grant after each assertion.
    const policyClient = await adminPool.connect();
    try {
      await policyClient.query("BEGIN");
      await policyClient.query("GRANT SELECT ON public.finance_user_tenant_memberships TO finance_runtime_test");
      await policyClient.query("SET LOCAL ROLE finance_runtime_test");
      await policyClient.query("SELECT set_config('app.tenant_id', $1, true)", [tenantA]);
      const own = await policyClient.query(
        `SELECT tenant_id, identity_subject
         FROM public.finance_user_tenant_memberships
         WHERE identity_issuer = $1`,
        [identityIssuer],
      );
      expect(own.rowCount).toBe(1);
      expect(own.rows[0]?.tenant_id).toBe(tenantA);
      expect(own.rows[0]?.identity_subject).toBe(subjectA);
      await policyClient.query("ROLLBACK");

      await policyClient.query("BEGIN");
      await policyClient.query("GRANT SELECT ON public.finance_user_tenant_memberships TO finance_runtime_test");
      await policyClient.query("SET LOCAL ROLE finance_runtime_test");
      const withoutContext = await policyClient.query(
        "SELECT id FROM public.finance_user_tenant_memberships",
      );
      expect(withoutContext.rowCount).toBe(0);
      await policyClient.query("ROLLBACK");
    } catch (error) {
      await policyClient.query("ROLLBACK");
      throw error;
    } finally {
      policyClient.release();
    }

    const runtime = await runtimePool.connect();
    try {
      await expect(runtime.query("SELECT id FROM public.finance_user_tenant_memberships"))
        .rejects.toMatchObject({ code: "42501" });
    } finally {
      runtime.release();
    }
  });

  it("has no membership-table privileges for the ordinary runtime role", async () => {
    const client = await runtimePool.connect();
    try {
      const grants = await client.query<{
        can_select: boolean;
        can_insert: boolean;
        can_update: boolean;
        can_delete: boolean;
        can_truncate: boolean;
        can_references: boolean;
        can_trigger: boolean;
        schema_usage: boolean;
        schema_create: boolean;
      }>(`
        SELECT
          has_table_privilege(current_user, 'public.finance_user_tenant_memberships', 'SELECT') AS can_select,
          has_table_privilege(current_user, 'public.finance_user_tenant_memberships', 'INSERT') AS can_insert,
          has_table_privilege(current_user, 'public.finance_user_tenant_memberships', 'UPDATE') AS can_update,
          has_table_privilege(current_user, 'public.finance_user_tenant_memberships', 'DELETE') AS can_delete,
          has_table_privilege(current_user, 'public.finance_user_tenant_memberships', 'TRUNCATE') AS can_truncate,
          has_table_privilege(current_user, 'public.finance_user_tenant_memberships', 'REFERENCES') AS can_references,
          has_table_privilege(current_user, 'public.finance_user_tenant_memberships', 'TRIGGER') AS can_trigger,
          has_schema_privilege(current_user, 'public', 'USAGE') AS schema_usage,
          has_schema_privilege(current_user, 'public', 'CREATE') AS schema_create
      `);
      expect(grants.rowCount).toBe(1);
      expect(grants.rows[0]?.can_select).toBe(false);
      expect(grants.rows[0]?.can_insert).toBe(false);
      expect(grants.rows[0]?.can_update).toBe(false);
      expect(grants.rows[0]?.can_delete).toBe(false);
      expect(grants.rows[0]?.can_truncate).toBe(false);
      expect(grants.rows[0]?.can_references).toBe(false);
      expect(grants.rows[0]?.can_trigger).toBe(false);
      expect(grants.rows[0]?.schema_usage).toBe(true);
      expect(grants.rows[0]?.schema_create).toBe(false);
    } finally {
      client.release();
    }
  });
});
