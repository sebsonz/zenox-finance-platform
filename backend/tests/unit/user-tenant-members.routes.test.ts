import express from "express";
import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const TENANT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER_ISSUER = "https://identity.example.test";

vi.mock("../../src/middleware/require-user-auth.js", () => ({
  requireUserAuth: () => (req: Request, _res: Response, next: NextFunction) => {
    req.financeUser = { id: USER_ID, issuer: USER_ISSUER, email: "user@example.test" };
    next();
  },
}));
vi.mock("../../src/modules/tenants/repositories/user-tenant-membership.repository.js", () => ({
  userTenantMembershipRepository: { findActiveMembership: vi.fn() },
}));
vi.mock("../../src/modules/tenants/repositories/tenant-members.repository.js", () => ({
  tenantMembersRepository: { list: vi.fn() },
}));

import { userTenantMembershipRepository } from "../../src/modules/tenants/repositories/user-tenant-membership.repository.js";
import { tenantMembersRepository } from "../../src/modules/tenants/repositories/tenant-members.repository.js";
import { userTenantMembersRouter } from "../../src/modules/user-auth/routes/user-tenant-members.routes.js";

function app() {
  const server = express();
  server.use("/user", userTenantMembersRouter);
  server.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({ error: { code: "INTERNAL_ERROR" } });
  });
  return server;
}

async function get(server: ReturnType<typeof express>, path: string) {
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

const owner = {
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  tenant_id: TENANT_ID,
  identity_issuer: USER_ISSUER,
  identity_subject: USER_ID,
  role_code: "OWNER" as const,
  status: "ACTIVE" as const,
  activated_at: new Date("2026-10-16T00:00:00.000Z"),
};

describe("GET /user/tenants/:tenantId/members", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(userTenantMembershipRepository.findActiveMembership).mockResolvedValue(owner as never);
    vi.mocked(tenantMembersRepository.list).mockResolvedValue({
      items: [{
        id: owner.id,
        identity_issuer: USER_ISSUER,
        identity_subject: USER_ID,
        role_code: "OWNER",
        status: "ACTIVE",
        invited_by: null,
        activated_at: owner.activated_at,
        created_at: owner.activated_at,
        updated_at: owner.activated_at,
      }],
      limit: 25,
      offset: 0,
    } as never);
  });

  it("rejects invalid tenant identifiers without querying membership", async () => {
    const response = await get(app(), "/user/tenants/nope/members");
    expect(response.status).toBe(400);
    expect(userTenantMembershipRepository.findActiveMembership).not.toHaveBeenCalled();
  });

  it("rejects invalid pagination parameters", async () => {
    const response = await get(app(), `/user/tenants/${TENANT_ID}/members?limit=500`);
    expect(response.status).toBe(400);
    expect(tenantMembersRepository.list).not.toHaveBeenCalled();
  });

  it("denies non-members and never queries the member list", async () => {
    vi.mocked(userTenantMembershipRepository.findActiveMembership).mockResolvedValue(null);
    const response = await get(app(), `/user/tenants/${TENANT_ID}/members`);
    expect(response.status).toBe(403);
    expect(tenantMembersRepository.list).not.toHaveBeenCalled();
  });

  it("returns a paginated member directory to authorized users", async () => {
    const response = await get(app(), `/user/tenants/${TENANT_ID}/members?limit=10&offset=0`);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      data: [{ id: owner.id, role: "OWNER", status: "ACTIVE" }],
      pagination: { limit: 10, offset: 0, count: 1 },
    });
    expect(tenantMembersRepository.list).toHaveBeenCalledWith(TENANT_ID, 10, 0);
  });

  it("forwards unexpected repository failures to the error handler", async () => {
    vi.mocked(tenantMembersRepository.list).mockRejectedValue(new Error("database unavailable"));
    const response = await get(app(), `/user/tenants/${TENANT_ID}/members`);
    expect(response.status).toBe(500);
  });
});
