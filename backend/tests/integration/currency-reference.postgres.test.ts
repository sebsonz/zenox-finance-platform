import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const adminUrl = process.env["TEST_DATABASE_URL"];
const runtimeUrl = process.env["TEST_RUNTIME_DATABASE_URL"];
const integrationDescribe = adminUrl && runtimeUrl ? describe : describe.skip;

integrationDescribe("PostgreSQL currency reference read access", () => {
  let adminPool: Pool;
  let runtimePool: Pool;

  beforeAll(() => {
    adminPool = new Pool({ connectionString: adminUrl, max: 2 });
    runtimePool = new Pool({ connectionString: runtimeUrl, max: 2 });
  });

  afterAll(async () => {
    await Promise.all([adminPool?.end(), runtimePool?.end()]);
  });

  it("allows reading active reference data without tenant context and rejects writes", async () => {
    const admin = await adminPool.connect();
    try {
      await admin.query(
        `INSERT INTO public.finance_currencies (code, name, minor_unit, is_active, source)
         VALUES ('XOF', 'West African CFA franc', 0, true, 'INTEGRATION_TEST')
         ON CONFLICT (code) DO UPDATE SET
           name = EXCLUDED.name,
           minor_unit = EXCLUDED.minor_unit,
           is_active = true,
           source = EXCLUDED.source`,
      );
    } finally {
      admin.release();
    }

    const runtime = await runtimePool.connect();
    try {
      const active = await runtime.query(
        "SELECT code, minor_unit, is_active FROM public.finance_currencies WHERE code = 'XOF'",
      );
      expect(active.rowCount).toBe(1);
      expect(active.rows[0]).toMatchObject({ code: "XOF", minor_unit: 0, is_active: true });

      await expect(
        runtime.query("UPDATE public.finance_currencies SET is_active = false WHERE code = 'XOF'"),
      ).rejects.toMatchObject({ code: "42501" });
    } finally {
      runtime.release();
    }
  });
});
