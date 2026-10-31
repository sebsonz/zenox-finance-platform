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

integrationDescribe("platform dashboard overview PostgreSQL function", () => {
  let adminPool: Pool;
  let runtimePool: Pool;

  beforeAll(() => {
    adminPool = new Pool({ connectionString: adminUrl, max: 2 });
    runtimePool = new Pool({ connectionString: runtimeUrl, max: 2 });
  });

  afterAll(async () => {
    await Promise.all([adminPool?.end(), runtimePool?.end()]);
  });

  it("returns only aggregate metrics to an active platform operator", async () => {
    const suffix = randomUUID();
    const operatorIssuer = "https://dashboard-platform.example.test";
    const operatorSubject = randomUUID();
    await adminPool.query(
      `INSERT INTO public.finance_platform_operators
        (identity_issuer, identity_subject, role_code, status)
       VALUES ($1, $2, 'PLATFORM_ADMIN', 'ACTIVE')
       ON CONFLICT (identity_issuer, identity_subject) DO UPDATE SET status = 'ACTIVE'`,
      [operatorIssuer, operatorSubject],
    );

    await expect(runtimePool.query(
      "SELECT public.finance_get_platform_dashboard_overview($1, $2)",
      [operatorIssuer, randomUUID()],
    )).rejects.toMatchObject({ code: "42501", message: "PLATFORM_OPERATOR_REQUIRED" });

    const before = await runtimePool.query<{ overview: {
      organizations: { total: number };
      registrations: { total: number; pending: number };
      users: { distinctIdentities: number };
      invoices: { total: number; draft: number; issued: number; cancelled: number };
      registrationTrend: Array<{ date: string; count: number }>;
      organizationsByCountry: Array<{ countryCode: string; count: number }>;
      generatedAt: string;
    } }>(
      "SELECT public.finance_get_platform_dashboard_overview($1, $2) AS overview",
      [operatorIssuer, operatorSubject],
    );

    const overview = before.rows[0]?.overview;
    expect(overview).toBeDefined();
    expect(overview?.organizations.total).toBeGreaterThanOrEqual(0);
    expect(overview?.registrations.total).toBeGreaterThanOrEqual(0);
    expect(overview?.registrations.pending).toBeGreaterThanOrEqual(0);
    expect(overview?.users.distinctIdentities).toBeGreaterThanOrEqual(0);
    expect(overview?.invoices).toEqual(expect.objectContaining({
      total: expect.any(Number),
      draft: expect.any(Number),
      issued: expect.any(Number),
      cancelled: expect.any(Number),
    }));
    expect(overview?.registrationTrend).toHaveLength(14);
    expect(overview?.organizationsByCountry).toEqual(expect.any(Array));
    expect(overview?.generatedAt).toEqual(expect.any(String));
    expect(JSON.stringify(overview)).not.toContain("identity_subject");
    expect(JSON.stringify(overview)).not.toContain("identity_issuer");

    await adminPool.query(
      "UPDATE public.finance_platform_operators SET status = 'SUSPENDED' WHERE identity_issuer = $1 AND identity_subject = $2",
      [operatorIssuer, operatorSubject],
    );
    await expect(runtimePool.query(
      "SELECT public.finance_get_platform_dashboard_overview($1, $2)",
      [operatorIssuer, operatorSubject],
    )).rejects.toMatchObject({ code: "42501", message: "PLATFORM_OPERATOR_REQUIRED" });
  });
});
