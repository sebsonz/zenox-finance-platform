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
  } catch { return false; }
}

const integrationDescribe = isDisposableFinanceUrl(adminUrl) && isDisposableFinanceUrl(runtimeUrl)
  ? describe : describe.skip;

integrationDescribe("organization onboarding drafts PostgreSQL functions", () => {
  let adminPool: Pool;
  let runtimePool: Pool;

  beforeAll(() => {
    adminPool = new Pool({ connectionString: adminUrl, max: 2 });
    runtimePool = new Pool({ connectionString: runtimeUrl, max: 2 });
  });

  afterAll(async () => {
    await Promise.all([adminPool?.end(), runtimePool?.end()]);
  });

  it("creates, resumes, updates and submits a draft exactly once", async () => {
    const issuer = "https://auth.example.test";
    const subject = randomUUID();
    const suffix = randomUUID().slice(0, 8);
    const payload = {
      organization: {
        legalName: `Onboarding Draft ${suffix}`,
        tradeName: "Draft Trade",
        legalForm: "SARL",
        countryCode: "BJ",
        defaultCurrency: "XOF",
        registrationNumber: null,
      },
      address: {
        addressType: "REGISTERED",
        addressLine1: "Rue de test",
        addressLine2: null,
        city: "Cotonou",
        region: "Littoral",
        postalCode: null,
        countryCode: "BJ",
      },
      representative: {
        fullName: "Test Representative",
        role: "Gérant",
        email: "representative@example.test",
        phone: null,
      },
      contact: {
        businessEmail: "contact@example.test",
        businessPhone: null,
        websiteUrl: null,
      },
    };

    const firstStepPayload = {
      organization: payload.organization,
      address: { addressType: "REGISTERED", addressLine1: "", addressLine2: null, city: "", region: null, postalCode: null, countryCode: "BJ" },
      representative: { fullName: "", role: "Représentant légal", email: "", phone: null },
      contact: { businessEmail: "", businessPhone: null, websiteUrl: null },
    };
    const created = await runtimePool.query<{ draft_id: string; payload: unknown }>(
      `SELECT draft_id, payload
         FROM public.finance_create_registration_draft($1, $2, $3::jsonb)`,
      [issuer, subject, JSON.stringify(firstStepPayload)],
    );
    const draftId = created.rows[0]?.draft_id;
    expect(draftId).toBeTruthy();
    expect(created.rows[0]?.payload).toMatchObject(firstStepPayload);

    await expect(runtimePool.query(
      "SELECT * FROM public.finance_registration_drafts",
    )).rejects.toMatchObject({ code: "42501" });

    const resumed = await runtimePool.query<{ draft_id: string; status: string }>(
      `SELECT draft_id, status
         FROM public.finance_get_current_registration_draft($1, $2)`,
      [issuer, subject],
    );
    expect(resumed.rows[0]).toMatchObject({ draft_id: draftId, status: "DRAFT" });

    const otherIdentity = await runtimePool.query(
      `SELECT draft_id FROM public.finance_get_my_registration_draft($1, $2, $3)`,
      [issuer, randomUUID(), draftId],
    );
    expect(otherIdentity.rows).toHaveLength(0);

    const secondStepPayload = {
      ...firstStepPayload,
      address: { ...payload.address },
    };
    await runtimePool.query(
      `SELECT * FROM public.finance_update_registration_draft($1, $2, $3, $4::jsonb)`,
      [issuer, subject, draftId, JSON.stringify(secondStepPayload)],
    );

    await expect(runtimePool.query(
      `SELECT * FROM public.finance_submit_registration_draft($1, $2, $3, $4, $5, $6)`,
      [issuer, subject, draftId, "terms-v1", "privacy-v1", `incomplete-${suffix}`],
    )).rejects.toMatchObject({ code: "P0001", message: "REGISTRATION_DRAFT_INCOMPLETE" });

    const updatedPayload = {
      ...payload,
      organization: { ...payload.organization, tradeName: "Updated Trade" },
    };
    await runtimePool.query(
      `SELECT * FROM public.finance_update_registration_draft($1, $2, $3, $4::jsonb)`,
      [issuer, subject, draftId, JSON.stringify(updatedPayload)],
    );

    const submitted = await runtimePool.query<{
      request_id: string; tenant_id: string; status: string;
    }>(
      `SELECT request_id, tenant_id, status
         FROM public.finance_submit_registration_draft($1, $2, $3, $4, $5, $6)`,
      [issuer, subject, draftId, "terms-v1", "privacy-v1", `draft-${suffix}`],
    );
    const request = submitted.rows[0];
    expect(request).toBeDefined();
    expect(request?.status).toBe("PENDING");

    const repeated = await runtimePool.query<{ request_id: string; tenant_id: string }>(
      `SELECT request_id, tenant_id, status
         FROM public.finance_submit_registration_draft($1, $2, $3, $4, $5, $6)`,
      [issuer, subject, draftId, "terms-v1", "privacy-v1", `draft-${suffix}`],
    );
    expect(repeated.rows[0]).toMatchObject({
      request_id: request?.request_id,
      tenant_id: request?.tenant_id,
    });

    await expect(runtimePool.query(
      `SELECT * FROM public.finance_create_registration_draft($1, $2, $3::jsonb)`,
      [issuer, subject, JSON.stringify(updatedPayload)],
    )).rejects.toMatchObject({ code: "P0001", message: "REGISTRATION_ALREADY_SUBMITTED" });

    const stored = await adminPool.query<{
      status: string; accepted_privacy_version: string; registration_data: { organization: { tradeName: string } };
    }>(
      `SELECT status, accepted_privacy_version, registration_data
         FROM public.finance_registration_requests WHERE id = $1`,
      [request?.request_id],
    );
    expect(stored.rows[0]).toMatchObject({
      status: "PENDING",
      accepted_privacy_version: "privacy-v1",
      registration_data: { organization: { tradeName: "Updated Trade" } },
    });

    const tenantCount = await adminPool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM public.finance_tenants WHERE id = $1",
      [request?.tenant_id],
    );
    expect(tenantCount.rows[0]?.count).toBe("1");

    const operatorIssuer = "https://platform.example.test";
    const operatorSubject = randomUUID();
    await adminPool.query(
      `INSERT INTO public.finance_platform_operators
        (identity_issuer, identity_subject, role_code, status)
       VALUES ($1, $2, 'PLATFORM_ADMIN', 'ACTIVE')`,
      [operatorIssuer, operatorSubject],
    );

    const decision = await runtimePool.query<{ status: string }>(
      `SELECT status
         FROM public.finance_review_registration_request($1, $2, $3, 'APPROVE', NULL, $4)`,
      [operatorIssuer, operatorSubject, request?.request_id, `approval-${suffix}`],
    );
    expect(decision.rows[0]?.status).toBe("APPROVED");

    const approvedTenant = await adminPool.query<{ status: string }>(
      "SELECT status FROM public.finance_tenants WHERE id = $1",
      [request?.tenant_id],
    );
    expect(approvedTenant.rows[0]?.status).toBe("ACTIVE");

    const profile = await adminPool.query<{
      trade_name: string | null; general_email: string | null;
    }>(
      `SELECT trade_name, general_email
         FROM public.finance_tenant_profiles WHERE tenant_id = $1`,
      [request?.tenant_id],
    );
    expect(profile.rows[0]).toMatchObject({
      trade_name: "Updated Trade",
      general_email: "contact@example.test",
    });

    const registeredAddress = await adminPool.query<{
      address_type: string; address_line1: string; city: string; country_code: string;
    }>(
      `SELECT address_type, address_line1, city, country_code
         FROM public.finance_tenant_addresses
        WHERE tenant_id = $1 AND status = 'ACTIVE'`,
      [request?.tenant_id],
    );
    expect(registeredAddress.rows[0]).toMatchObject({
      address_type: "REGISTERED",
      address_line1: "Rue de test",
      city: "Cotonou",
      country_code: "BJ",
    });
  });
});
