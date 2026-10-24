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

integrationDescribe("organization registration PostgreSQL functions", () => {
  let adminPool: Pool;
  let runtimePool: Pool;

  beforeAll(() => {
    adminPool = new Pool({ connectionString: adminUrl, max: 2 });
    runtimePool = new Pool({ connectionString: runtimeUrl, max: 2 });
  });

  afterAll(async () => {
    await Promise.all([adminPool?.end(), runtimePool?.end()]);
  });

  it("atomically creates a pending tenant, owner membership, request, and audit event", async () => {
    const suffix = randomUUID();
    const issuer = "https://auth.example.test";
    const subject = randomUUID();
    const legalName = `Registration Integration ${suffix.slice(0, 8)}`;
    const correlationId = `registration-test-${suffix.slice(0, 24)}`;

    const submitted = await runtimePool.query<{
      request_id: string; tenant_id: string; status: string; submitted_at: Date;
    }>(
      `SELECT request_id, tenant_id, status, submitted_at
         FROM public.finance_submit_organization_registration($1, $2, $3, $4, $5, $6, $7)`,
      [issuer, subject, legalName, "BJ", "XOF", "test-terms-2026-10", correlationId],
    );
    const request = submitted.rows[0];
    expect(request).toBeDefined();
    expect(request?.status).toBe("PENDING");

    const ownRequests = await runtimePool.query<{ request_id: string; tenant_id: string; legal_name: string }>(
      `SELECT request_id, tenant_id, legal_name
         FROM public.finance_list_my_registration_requests($1, $2)`,
      [issuer, subject],
    );
    expect(ownRequests.rows).toHaveLength(1);
    expect(ownRequests.rows[0]).toMatchObject({
      request_id: request?.request_id,
      tenant_id: request?.tenant_id,
      legal_name: legalName,
    });

    const otherUser = await runtimePool.query(
      `SELECT request_id FROM public.finance_list_my_registration_requests($1, $2)`,
      [issuer, randomUUID()],
    );
    expect(otherUser.rows).toHaveLength(0);

    const state = await adminPool.query<{
      tenant_status: string;
      membership_role: string;
      membership_status: string;
      request_status: string;
      audit_count: string;
    }>(
      `SELECT t.status AS tenant_status,
              m.role_code AS membership_role,
              m.status AS membership_status,
              r.status AS request_status,
              (SELECT count(*)::text FROM public.finance_audit_events a
                WHERE a.tenant_id = t.id
                  AND a.action = 'ORGANIZATION_REGISTRATION_SUBMITTED'
                  AND a.correlation_id = $2) AS audit_count
         FROM public.finance_tenants t
         JOIN public.finance_user_tenant_memberships m ON m.tenant_id = t.id
         JOIN public.finance_registration_requests r ON r.tenant_id = t.id
        WHERE t.id = $1 AND m.identity_issuer = $3 AND m.identity_subject = $4`,
      [request?.tenant_id, correlationId, issuer, subject],
    );
    expect(state.rows[0]).toMatchObject({
      tenant_status: "PENDING",
      membership_role: "OWNER",
      membership_status: "PENDING",
      request_status: "PENDING",
      audit_count: "1",
    });

    await expect(runtimePool.query(
      `SELECT * FROM public.finance_submit_organization_registration($1, $2, $3, $4, $5, $6, $7)`,
      [issuer, subject, legalName, "BJ", "XOF", "test-terms-2026-10", correlationId],
    )).rejects.toMatchObject({ code: "23505" });

    const duplicateCount = await adminPool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM public.finance_tenants WHERE legal_name = $1",
      [legalName],
    );
    expect(duplicateCount.rows[0]?.count).toBe("1");
  });

  it("rejects unsupported currencies without creating an organization", async () => {
    const suffix = randomUUID();
    const legalName = `Unsupported Currency ${suffix.slice(0, 8)}`;
    await expect(runtimePool.query(
      `SELECT * FROM public.finance_submit_organization_registration($1, $2, $3, $4, $5, $6, $7)`,
      ["https://auth.example.test", randomUUID(), legalName, "BJ", "ZZZ", "test-terms-2026-10", "invalid-currency-test"],
    )).rejects.toMatchObject({ code: "22023", message: "UNSUPPORTED_CURRENCY" });
    const result = await adminPool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM public.finance_tenants WHERE legal_name = $1",
      [legalName],
    );
    expect(result.rows[0]?.count).toBe("0");
  });
});
