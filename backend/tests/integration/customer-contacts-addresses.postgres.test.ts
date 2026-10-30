import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const adminUrl = process.env["TEST_DATABASE_URL"];
const runtimeUrl = process.env["TEST_RUNTIME_DATABASE_URL"];
const integrationDescribe = adminUrl && runtimeUrl ? describe : describe.skip;
const tenantA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const tenantB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

integrationDescribe("M04 customer contacts and addresses tenant isolation", () => {
  let adminPool: Pool;
  let runtimePool: Pool;

  beforeAll(() => {
    adminPool = new Pool({ connectionString: adminUrl, max: 2 });
    runtimePool = new Pool({ connectionString: runtimeUrl, max: 2 });
  });

  afterAll(async () => {
    await Promise.all([adminPool?.end(), runtimePool?.end()]);
  });

  async function seedCustomer(tenantId: string, code: string): Promise<string> {
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO public.finance_customers
        (tenant_id, customer_code, customer_type, legal_name, country_code, status, metadata)
       VALUES ($1, $2, 'BUSINESS', $3, 'BJ', 'ACTIVE', '{}'::jsonb)
       RETURNING id`,
      [tenantId, code, `M04 ${code}`],
    );
    return result.rows[0]!.id;
  }

  it("isolates contacts and addresses by transaction-local tenant context", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
    const customerA = await seedCustomer(tenantA, `M04A_${suffix}`);
    const customerB = await seedCustomer(tenantB, `M04B_${suffix}`);

    const seeded = await adminPool.connect();
    let contactA = "";
    let contactB = "";
    let addressA = "";
    let addressB = "";
    try {
      await seeded.query("BEGIN");
      const contactRows = await seeded.query<{ id: string }>(
        `INSERT INTO public.finance_customer_contacts
          (tenant_id, customer_id, full_name, contact_type)
         VALUES ($1, $2, 'Tenant A Contact', 'GENERAL'), ($3, $4, 'Tenant B Contact', 'GENERAL')
         RETURNING id`,
        [tenantA, customerA, tenantB, customerB],
      );
      contactA = contactRows.rows[0]!.id;
      contactB = contactRows.rows[1]!.id;
      const addressRows = await seeded.query<{ id: string }>(
        `INSERT INTO public.finance_customer_addresses
          (tenant_id, customer_id, address_type, address_line1, city, country_code)
         VALUES ($1, $2, 'BILLING', '1 Tenant A Street', 'Cotonou', 'BJ'),
                ($3, $4, 'BILLING', '2 Tenant B Street', 'Cotonou', 'BJ')
         RETURNING id`,
        [tenantA, customerA, tenantB, customerB],
      );
      addressA = addressRows.rows[0]!.id;
      addressB = addressRows.rows[1]!.id;
      await seeded.query("COMMIT");
    } catch (error) {
      await seeded.query("ROLLBACK");
      throw error;
    } finally {
      seeded.release();
    }

    const runtime = await runtimePool.connect();
    try {
      await runtime.query("BEGIN");
      await runtime.query("SELECT set_config('app.tenant_id', $1, true)", [tenantA]);
      expect((await runtime.query("SELECT id FROM public.finance_customer_contacts WHERE id = $1", [contactA])).rowCount).toBe(1);
      expect((await runtime.query("SELECT id FROM public.finance_customer_contacts WHERE id = $1", [contactB])).rowCount).toBe(0);
      expect((await runtime.query("SELECT id FROM public.finance_customer_addresses WHERE id = $1", [addressA])).rowCount).toBe(1);
      expect((await runtime.query("SELECT id FROM public.finance_customer_addresses WHERE id = $1", [addressB])).rowCount).toBe(0);
      await runtime.query("ROLLBACK");

      await runtime.query("BEGIN");
      expect((await runtime.query("SELECT id FROM public.finance_customer_contacts WHERE id = $1", [contactA])).rowCount).toBe(0);
      expect((await runtime.query("SELECT id FROM public.finance_customer_addresses WHERE id = $1", [addressA])).rowCount).toBe(0);
      await runtime.query("ROLLBACK");
    } catch (error) {
      await runtime.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      runtime.release();
    }
  });

  it("rejects a contact whose tenant does not own the referenced customer", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
    const customerB = await seedCustomer(tenantB, `M04FK_${suffix}`);
    await expect(adminPool.query(
      `INSERT INTO public.finance_customer_contacts
        (tenant_id, customer_id, full_name)
       VALUES ($1, $2, 'Invalid cross-tenant contact')`,
      [tenantA, customerB],
    )).rejects.toMatchObject({ code: "23503" });
  });
});
