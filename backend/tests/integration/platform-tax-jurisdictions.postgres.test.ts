import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const adminUrl = process.env["TEST_DATABASE_URL"];
const runtimeUrl = process.env["TEST_RUNTIME_DATABASE_URL"];

function isDisposableFinanceUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return ["localhost", "127.0.0.1", "::1"].includes(url.hostname) &&
      url.pathname.replace(/^\//, "") === "finance_test";
  } catch {
    return false;
  }
}

const integrationDescribe = isDisposableFinanceUrl(adminUrl) && isDisposableFinanceUrl(runtimeUrl)
  ? describe
  : describe.skip;

integrationDescribe("M20/M10 platform tax jurisdiction read boundary", () => {
  let adminPool: Pool;
  let runtimePool: Pool;

  beforeAll(() => {
    adminPool = new Pool({ connectionString: adminUrl, max: 2 });
    runtimePool = new Pool({ connectionString: runtimeUrl, max: 2 });
  });

  afterAll(async () => {
    await Promise.all([adminPool?.end(), runtimePool?.end()]);
  });

  it("allows backend read of active jurisdictions only and denies direct writes", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
    const activeCode = `ITEST_TAX_${suffix}_ACTIVE`;
    const inactiveCode = `ITEST_TAX_${suffix}_INACTIVE`;

    await adminPool.query(
      `INSERT INTO public.finance_tax_jurisdictions
        (code, country_code, name, jurisdiction_level, is_active)
       VALUES ($1, 'BJ', 'Integration active jurisdiction', 'COUNTRY', true),
              ($2, 'BJ', 'Integration inactive jurisdiction', 'COUNTRY', false)`,
      [activeCode, inactiveCode],
    );

    try {
      const visible = await runtimePool.query<{ code: string; is_active: boolean }>(
        `SELECT code, is_active
           FROM public.finance_tax_jurisdictions
          WHERE code = ANY($1::text[])
          ORDER BY code`,
        [[activeCode, inactiveCode]],
      );
      expect(visible.rows).toEqual([{ code: activeCode, is_active: true }]);

      await expect(runtimePool.query(
        `INSERT INTO public.finance_tax_jurisdictions
          (code, country_code, name, jurisdiction_level)
         VALUES ($1, 'BJ', 'Runtime write must fail', 'COUNTRY')`,
        [`ITEST_TAX_${suffix}_WRITE`],
      )).rejects.toMatchObject({ code: "42501" });

      await expect(runtimePool.query(
        "UPDATE public.finance_tax_jurisdictions SET name = 'Runtime update must fail' WHERE code = $1",
        [activeCode],
      )).rejects.toMatchObject({ code: "42501" });
    } finally {
      await adminPool.query(
        "DELETE FROM public.finance_tax_jurisdictions WHERE code = ANY($1::text[])",
        [[activeCode, inactiveCode]],
      );
    }
  });

  it("does not grant direct table access to browser roles", async () => {
    const result = await adminPool.query<{
      anon_select: boolean;
      authenticated_select: boolean;
      service_role_select: boolean;
    }>(
      `SELECT
        CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
          THEN has_table_privilege('anon', 'public.finance_tax_jurisdictions', 'SELECT')
          ELSE false END AS anon_select,
        CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')
          THEN has_table_privilege('authenticated', 'public.finance_tax_jurisdictions', 'SELECT')
          ELSE false END AS authenticated_select,
        CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role')
          THEN has_table_privilege('service_role', 'public.finance_tax_jurisdictions', 'SELECT')
          ELSE false END AS service_role_select`,
    );
    expect(result.rows[0]).toEqual({
      anon_select: false,
      authenticated_select: false,
      service_role_select: false,
    });
  });
});
