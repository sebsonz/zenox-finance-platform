import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const adminUrl = process.env["TEST_DATABASE_URL"];
const runtimeUrl = process.env["TEST_RUNTIME_DATABASE_URL"];
const integrationDescribe = adminUrl && runtimeUrl ? describe : describe.skip;
const tenantA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const tenantB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

integrationDescribe("PostgreSQL customer tenant isolation and cursor pagination", () => {
  let adminPool: Pool;
  let runtimePool: Pool;

  beforeAll(() => {
    adminPool = new Pool({ connectionString: adminUrl, max: 2 });
    runtimePool = new Pool({ connectionString: runtimeUrl, max: 2 });
  });

  afterAll(async () => {
    await Promise.all([adminPool?.end(), runtimePool?.end()]);
  });

  async function seedCustomer(tenantId: string, code: string, legalName: string): Promise<string> {
    const client = await adminPool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
      const result = await client.query<{ id: string }>(
        `INSERT INTO public.finance_customers
          (tenant_id, customer_code, customer_type, legal_name, country_code, status, metadata)
         VALUES ($1, $2, 'BUSINESS', $3, 'BJ', 'ACTIVE', '{"seed":"customer-isolation-test"}'::jsonb)
         RETURNING id`,
        [tenantId, code, legalName],
      );
      await client.query("COMMIT");
      return result.rows[0]!.id;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  it("reads only rows from the active tenant and fails closed without tenant context", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
    const customerA = await seedCustomer(tenantA, `CA_${suffix}`, `A Customer ${suffix}`);
    const customerB = await seedCustomer(tenantB, `CB_${suffix}`, `B Customer ${suffix}`);
    const client = await runtimePool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantA]);
      const own = await client.query("SELECT id FROM public.finance_customers WHERE id = $1", [customerA]);
      const foreign = await client.query("SELECT id FROM public.finance_customers WHERE id = $1", [customerB]);
      expect(own.rowCount).toBe(1);
      expect(foreign.rowCount).toBe(0);
      await client.query("ROLLBACK");

      await client.query("BEGIN");
      const withoutContext = await client.query(
        "SELECT id FROM public.finance_customers WHERE id IN ($1, $2)",
        [customerA, customerB],
      );
      expect(withoutContext.rowCount).toBe(0);
      await client.query("ROLLBACK");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });

  it("supports deterministic cursor pagination on the ascending UUID order", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
    const ids = [
      await seedCustomer(tenantA, `P1_${suffix}`, `Pagination ${suffix} A`),
      await seedCustomer(tenantA, `P2_${suffix}`, `Pagination ${suffix} B`),
      await seedCustomer(tenantA, `P3_${suffix}`, `Pagination ${suffix} C`),
    ];
    const client = await runtimePool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantA]);
      const orderedIds = [...ids].sort();
      const first = await client.query<{ id: string }>(
        `SELECT id FROM public.finance_customers
         WHERE tenant_id = $1 AND customer_code LIKE $2
         ORDER BY id ASC LIMIT 2`,
        [tenantA, `P%_${suffix}`],
      );
      expect(first.rows.map((row) => row.id)).toEqual(orderedIds.slice(0, 2));
      const second = await client.query<{ id: string }>(
        `SELECT id FROM public.finance_customers
         WHERE tenant_id = $1 AND customer_code LIKE $2 AND id > $3::uuid
         ORDER BY id ASC LIMIT 2`,
        [tenantA, `P%_${suffix}`, first.rows[1]!.id],
      );
      expect(second.rows.map((row) => row.id)).toEqual(orderedIds.slice(2));
      await client.query("ROLLBACK");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });
});
