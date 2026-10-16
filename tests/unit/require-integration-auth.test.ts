import { createHash } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/modules/integration-auth/repositories/integration-principal.repository.js", () => ({
  integrationPrincipalRepository: { findByCode: vi.fn() },
}));
vi.mock("../../src/modules/tenants/repositories/tenant.repository.js", () => ({
  tenantRepository: { findActiveById: vi.fn() },
}));

import { requireIntegrationAuth } from "../../src/middleware/require-integration-auth.js";
import { integrationPrincipalRepository } from "../../src/modules/integration-auth/repositories/integration-principal.repository.js";
import { tenantRepository } from "../../src/modules/tenants/repositories/tenant.repository.js";

const TENANT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TENANT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TOKEN = "test-service-token-with-more-than-32-characters";

function principal(overrides: Record<string, unknown> = {}) {
  return {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    principal_code: "zenox-fret",
    display_name: "ZENOX FRET",
    credential_hash: createHash("sha256").update(TOKEN).digest("hex"),
    allowed_scopes: ["tax:snapshot:write", "tax:snapshot:read"],
    allowed_tenant_ids: [TENANT_A],
    status: "ACTIVE",
    ...overrides,
  };
}

function request(headers: Record<string, string> = {}) {
  return {
    header: (name: string) => headers[name.toLowerCase()],
    financeContext: undefined,
  } as unknown as Request;
}

function response() {
  const res = {
    locals: { correlationId: "corr-test-123" } as Record<string, unknown>,
    statusCode: 200,
    body: undefined as unknown,
    setHeader: vi.fn(),
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
  return res as unknown as Response & typeof res;
}

async function invoke(headers: Record<string, string>, scopes: readonly string[] = ["tax:snapshot:write"]) {
  const req = request(headers);
  const res = response();
  const next = vi.fn<NextFunction>();
  await requireIntegrationAuth(scopes)(req, res, next);
  return { req, res, next };
}

describe("requireIntegrationAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(integrationPrincipalRepository.findByCode).mockResolvedValue(principal() as never);
    vi.mocked(tenantRepository.findActiveById).mockResolvedValue({
      id: TENANT_A,
      tenant_code: "ITEST_A",
      legal_name: "Integration tenant A",
      status: "ACTIVE",
    });
  });

  it("rejects missing credentials before database access", async () => {
    const { res, next } = await invoke({});
    expect(res.statusCode).toBe(401);
    expect(res.body).toMatchObject({ error: { code: "UNAUTHENTICATED" } });
    expect(integrationPrincipalRepository.findByCode).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects an invalid bearer token", async () => {
    const { res, next } = await invoke({
      "x-finance-client-id": "zenox-fret",
      authorization: "Bearer wrong-token-that-is-definitely-long-enough-123",
      "x-finance-tenant-id": TENANT_A,
    });
    expect(res.statusCode).toBe(401);
    expect(res.body).toMatchObject({ error: { code: "UNAUTHENTICATED" } });
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects a principal without the required scope", async () => {
    const { res, next } = await invoke({
      "x-finance-client-id": "zenox-fret",
      authorization: `Bearer ${TOKEN}`,
      "x-finance-tenant-id": TENANT_A,
    }, ["invoice:issue"]);
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ error: { code: "INSUFFICIENT_SCOPE" } });
    expect(tenantRepository.findActiveById).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects a tenant not granted to the integration principal", async () => {
    const { res, next } = await invoke({
      "x-finance-client-id": "zenox-fret",
      authorization: `Bearer ${TOKEN}`,
      "x-finance-tenant-id": TENANT_B,
    });
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ error: { code: "TENANT_ACCESS_DENIED" } });
    expect(tenantRepository.findActiveById).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("attaches a verified tenant context and continues", async () => {
    const { req, res, next } = await invoke({
      "x-finance-client-id": "zenox-fret",
      authorization: `Bearer ${TOKEN}`,
      "x-finance-tenant-id": TENANT_A,
    });
    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(200);
    expect(req.financeContext).toMatchObject({
      tenantId: TENANT_A,
      correlationId: "corr-test-123",
      principal: {
        principalCode: "zenox-fret",
        scopes: ["tax:snapshot:write", "tax:snapshot:read"],
        allowedTenantIds: [TENANT_A],
      },
    });
    expect(tenantRepository.findActiveById).toHaveBeenCalledWith(TENANT_A);
  });

  it("rejects an inactive tenant even when a grant exists", async () => {
    vi.mocked(tenantRepository.findActiveById).mockResolvedValue(null);
    const { res, next } = await invoke({
      "x-finance-client-id": "zenox-fret",
      authorization: `Bearer ${TOKEN}`,
      "x-finance-tenant-id": TENANT_A,
    });
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ error: { code: "TENANT_INACTIVE_OR_UNKNOWN" } });
    expect(next).not.toHaveBeenCalled();
  });
});
