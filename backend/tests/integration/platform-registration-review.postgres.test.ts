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

integrationDescribe("platform registration review PostgreSQL functions", () => {
  let adminPool: Pool;
  let runtimePool: Pool;

  beforeAll(() => {
    adminPool = new Pool({ connectionString: adminUrl, max: 2 });
    runtimePool = new Pool({ connectionString: runtimeUrl, max: 2 });
  });

  afterAll(async () => {
    await Promise.all([adminPool?.end(), runtimePool?.end()]);
  });

  async function submitRequest(identityIssuer: string, identitySubject: string, legalName: string) {
    const suffix = randomUUID();
    const result = await runtimePool.query<{
      request_id: string; tenant_id: string; status: string;
    }>(
      `SELECT request_id, tenant_id, status
         FROM public.finance_submit_organization_registration($1, $2, $3, $4, $5, $6, $7)`,
      [identityIssuer, identitySubject, legalName, "BJ", "XOF", "test-terms-2026-10", `review-${suffix.slice(0, 24)}`],
    );
    return result.rows[0]!;
  }

  async function bootstrapOperator(identityIssuer: string, identitySubject: string) {
    await adminPool.query(
      `INSERT INTO public.finance_platform_operators
        (identity_issuer, identity_subject, role_code, status)
       VALUES ($1, $2, 'PLATFORM_ADMIN', 'ACTIVE')
       ON CONFLICT (identity_issuer, identity_subject) DO UPDATE SET status = 'ACTIVE'`,
      [identityIssuer, identitySubject],
    );
  }

  it("requires an explicitly bootstrapped platform operator and atomically approves a request", async () => {
    const suffix = randomUUID();
    const operatorIssuer = "https://platform-auth.example.test";
    const operatorSubject = randomUUID();
    const ownerIssuer = "https://customer-auth.example.test";
    const ownerSubject = randomUUID();
    const request = await submitRequest(ownerIssuer, ownerSubject, `Approve Request ${suffix.slice(0, 8)}`);

    await expect(runtimePool.query(
      "SELECT * FROM public.finance_list_pending_registration_requests($1, $2)",
      [operatorIssuer, operatorSubject],
    )).rejects.toMatchObject({ code: "42501", message: "PLATFORM_OPERATOR_REQUIRED" });

    await bootstrapOperator(operatorIssuer, operatorSubject);
    const pending = await runtimePool.query<{ request_id: string }>(
      "SELECT request_id FROM public.finance_list_pending_registration_requests($1, $2)",
      [operatorIssuer, operatorSubject],
    );
    expect(pending.rows.some((row) => row.request_id === request.request_id)).toBe(true);

    const decision = await runtimePool.query<{ request_id: string; tenant_id: string; status: string }>(
      `SELECT request_id, tenant_id, status
         FROM public.finance_review_registration_request($1, $2, $3, $4, $5, $6)`,
      [operatorIssuer, operatorSubject, request.request_id, "APPROVE", null, `approve-${suffix.slice(0, 24)}`],
    );
    expect(decision.rows[0]).toMatchObject({ request_id: request.request_id, tenant_id: request.tenant_id, status: "APPROVED" });

    const state = await adminPool.query<{
      tenant_status: string; membership_status: string; membership_role: string; request_status: string; audit_count: string;
    }>(
      `SELECT t.status AS tenant_status, m.status AS membership_status, m.role_code AS membership_role,
              r.status AS request_status,
              (SELECT count(*)::text FROM public.finance_audit_events a
                WHERE a.tenant_id = t.id AND a.action = 'ORGANIZATION_REGISTRATION_APPROVED'
                  AND a.resource_id = r.id) AS audit_count
         FROM public.finance_tenants t
         JOIN public.finance_user_tenant_memberships m ON m.tenant_id = t.id
         JOIN public.finance_registration_requests r ON r.tenant_id = t.id
        WHERE t.id = $1 AND m.identity_issuer = $2 AND m.identity_subject = $3`,
      [request.tenant_id, ownerIssuer, ownerSubject],
    );
    expect(state.rows[0]).toMatchObject({
      tenant_status: "ACTIVE",
      membership_status: "ACTIVE",
      membership_role: "OWNER",
      request_status: "APPROVED",
      audit_count: "1",
    });
    const ownerRequests = await runtimePool.query<{ status: string }>(
      "SELECT status FROM public.finance_list_my_registration_requests($1, $2)",
      [ownerIssuer, ownerSubject],
    );
    expect(ownerRequests.rows[0]?.status).toBe("APPROVED");
  });

  it("rejects self-review and atomically disables a rejected organization", async () => {
    const suffix = randomUUID();
    const operatorIssuer = "https://review-auth.example.test";
    const operatorSubject = randomUUID();
    await bootstrapOperator(operatorIssuer, operatorSubject);

    const ownRequest = await submitRequest(operatorIssuer, operatorSubject, `Self Review ${suffix.slice(0, 8)}`);
    await expect(runtimePool.query(
      `SELECT * FROM public.finance_review_registration_request($1, $2, $3, $4, $5, $6)`,
      [operatorIssuer, operatorSubject, ownRequest.request_id, "APPROVE", null, `self-${suffix.slice(0, 24)}`],
    )).rejects.toMatchObject({ code: "42501", message: "SELF_REVIEW_NOT_ALLOWED" });

    const ownerIssuer = "https://reject-auth.example.test";
    const ownerSubject = randomUUID();
    const rejectedRequest = await submitRequest(ownerIssuer, ownerSubject, `Reject Request ${suffix.slice(0, 8)}`);
    const reason = "Company registration information could not be verified.";
    const result = await runtimePool.query<{ status: string }>(
      `SELECT status FROM public.finance_review_registration_request($1, $2, $3, $4, $5, $6)`,
      [operatorIssuer, operatorSubject, rejectedRequest.request_id, "REJECT", reason, `reject-${suffix.slice(0, 24)}`],
    );
    expect(result.rows[0]?.status).toBe("REJECTED");

    const state = await adminPool.query<{ tenant_status: string; membership_status: string; request_status: string; rejection_reason: string | null }>(
      `SELECT t.status AS tenant_status, m.status AS membership_status,
              r.status AS request_status, r.rejection_reason
         FROM public.finance_tenants t
         JOIN public.finance_user_tenant_memberships m ON m.tenant_id = t.id
         JOIN public.finance_registration_requests r ON r.tenant_id = t.id
        WHERE t.id = $1 AND m.identity_issuer = $2 AND m.identity_subject = $3`,
      [rejectedRequest.tenant_id, ownerIssuer, ownerSubject],
    );
    expect(state.rows[0]).toMatchObject({
      tenant_status: "DISABLED",
      membership_status: "REVOKED",
      request_status: "REJECTED",
      rejection_reason: reason,
    });
  });
});
