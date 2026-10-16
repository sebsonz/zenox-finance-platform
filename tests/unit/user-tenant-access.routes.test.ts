import express from "express";
import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const TENANT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER_ISSUER = "https://qsmairsmgfnlmiltvgvn.supabase.co";

vi.mock("../../src/middleware/require-user-auth.js", () => ({
  requireUserAuth: () => (req: Request, _res: Response, next: NextFunction) => {
    req.financeUser = { id: USER_ID, issuer: USER_ISSUER, email: "user@example.test" };
    next();
  },
}));
vi.mock("../../src/modules/tenants/repositories/user-tenant-membership.repository.js", () => ({
  userTenantMembershipRepository: { findActiveMembership: vi.fn() },
}));
vi.mock("../../src/modules/tenants/repositories/tenant.repository.js", () => ({
  tenantRepository: { findActiveById: vi.fn() },
}));

import { userTenantMembershipRepository } from "../../src/modules/tenants/repositories/user-tenant-membership.repository.js";
import { tenantRepository } from "../../src/modules/tenants/repositories/tenant.repository.js";
import { userTenantAccessRouter } from "../../src/modules/user-auth/routes/user-tenant-access.routes.js";

function app() {
  const server = express();
  server.use("/user", userTenantAccessRouter);
  server.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({ error: { code: "INTERNAL_ERROR" } });
  });
  return server;
}

async function getWithExpress(server: ReturnType<typeof express>, path: string) {
  const listener = await new Promise<ReturnType<typeof import("node:http").createServer>>((resolve) => {
    const httpServer = server.listen(0, "127.0.0.1", () => resolve(httpServer));
  });
  const address = listener.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind a TCP port");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`);
    return { status: response.status, body: await response.json() as unknown };
  } finally {
    await new Promise<void>((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  }
}

function activeMembership(role_code: "OWNER" | "ADMIN" | "FINANCE_MANAGER" | "FINANCE_OPERATOR" | "VIEWER" = "VIEWER") {
  return {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    tenant_id: TENANT_ID,
    identity_issuer: USER_ISSUER,
    identity_subject: USER_ID,
    role_code,
    status: "ACTIVE" as const,
    activated_at: new Date("2026-10-16T00:00:00.000Z"),
  };
}

describe("GET /user/tenants/:tenantId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(userTenantMembershipRepository.findActiveMembership).mockResolvedValue(activeMembership() as never);
    vi.mocked(tenantRepository.findActiveById).mockResolvedValue({
      id: TENANT_ID,
      tenant_code: "ZNX-000001",
      legal_name: "ZENOX Demo Company",
      status: "ACTIVE",
    });
  });

  it("rejects malformed tenant identifiers before querying membership", async () => {
    const response = await getWithExpress(app(), "/user/tenants/not-a-uuid");
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: { code: "INVALID_TENANT_ID" } });
    expect(userTenantMembershipRepository.findActiveMembership).not.toHaveBeenCalled();
    expect(tenantRepository.findActiveById).not.toHaveBeenCalled();
  });

  it("denies access when the user has no active membership", async () => {
    vi.mocked(userTenantMembershipRepository.findActiveMembership).mockResolvedValue(null);
    const response = await getWithExpress(app(), `/user/tenants/${TENANT_ID}`);
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ error: { code: "TENANT_ACCESS_DENIED" } });
    expect(tenantRepository.findActiveById).not.toHaveBeenCalled();
  });

  it("returns only the tenant access summary for an active member", async () => {
    const response = await getWithExpress(app(), `/user/tenants/${TENANT_ID}`);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      data: {
        id: TENANT_ID,
        tenantCode: "ZNX-000001",
        legalName: "ZENOX Demo Company",
        role: "VIEWER",
      },
    });
    expect(userTenantMembershipRepository.findActiveMembership).toHaveBeenCalledWith(
      TENANT_ID,
      USER_ISSUER,
      USER_ID,
    );
  });

  it("does not return a tenant that is inactive or unavailable", async () => {
    vi.mocked(tenantRepository.findActiveById).mockResolvedValue(null);
    const response = await getWithExpress(app(), `/user/tenants/${TENANT_ID}`);
    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ error: { code: "TENANT_NOT_AVAILABLE" } });
  });

  it("forwards unexpected repository failures to the error handler", async () => {
    vi.mocked(userTenantMembershipRepository.findActiveMembership).mockRejectedValue(new Error("database unavailable"));
    const response = await getWithExpress(app(), `/user/tenants/${TENANT_ID}`);
    expect(response.status).toBe(500);
    expect(response.body).toMatchObject({ error: { code: "INTERNAL_ERROR" } });
  });
});
