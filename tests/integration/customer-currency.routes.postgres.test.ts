import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const adminUrl = process.env["TEST_DATABASE_URL"];
const runtimeUrl = process.env["TEST_RUNTIME_DATABASE_URL"];
const integrationDescribe = adminUrl && runtimeUrl ? describe : describe.skip;
const tenantA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const tenantB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

integrationDescribe("PostgreSQL customer write and read isolation contract", () => {
  let adminPool: Pool;
  let runtimePool: Pool;

  beforeAll(() => {
    adminPool = new Pool({ connectionString: adminUrl, max: 2 });
    runtimePool = new Pool({ connectionString: runtimeUrl, max: 2 });
  });

  afterAll(async () => {
    await Promise.all([adminPool?.end(), runtimePool?.end()]);
  });

  it("permits tenant-scoped customer writes but not cross-tenant reads", async () => {
    const suffix = Date.now().toString(36).toUpperCase();
    const customerCode = `API_${suffix}`;
    const admin = await adminPool.connect();
    let customerId = "";
    try {
      await admin.query("BEGIN");
      await admin.query("SELECT set_config('app.tenant_id', $1, true)", [tenantA]);
      const created = await admin.query<{ id: string }>(
        `INSERT INTO public.finance_customers
          (tenant_id, customer_code, customer_type, legal_name, country_code, status, metadata)
         VALUES ($1, $2, 'BUSINESS', 'API Contract Customer', 'BJ', 'ACTIVE', '{}'::jsonb)
         RETURNING id`,
        [tenantA, customerCode],
      );
      customerId = created.rows[0]!.id;
      await admin.query("COMMIT");
    } catch (error) {
      await admin.query("ROLLBACK");
      throw error;
    } finally {
      admin.release();
    }

    const runtime = await runtimePool.connect();
    try {
      await runtime.query("BEGIN");
      await runtime.query("SELECT set_config('app.tenant_id', $1, true)", [tenantA]);
      const own = await runtime.query<{ id: string }>(
        "SELECT id FROM public.finance_customers WHERE id = $1",
        [customerId],
      );
      expect(own.rowCount).toBe(1);
      await runtime.query("ROLLBACK");

      await runtime.query("BEGIN");
      await runtime.query("SELECT set_config('app.tenant_id', $1, true)", [tenantB]);
      const foreign = await runtime.query<{ id: string }>(
        "SELECT id FROM public.finance_customers WHERE id = $1",
        [customerId],
      );
      expect(foreign.rowCount).toBe(0);
      const forbiddenUpdate = await runtime.query(
        "UPDATE public.finance_customers SET legal_name = 'tampered' WHERE id = $1",
        [customerId],
      );
      expect(forbiddenUpdate.rowCount).toBe(0);
      await runtime.query("ROLLBACK");
    } catch (error) {
      await runtime.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      runtime.release();
    }
  });
});
