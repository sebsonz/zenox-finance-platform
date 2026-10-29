import express from "express";
import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const TENANT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MEMBER_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const USER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER_ISSUER = "https://identity.example.test";

vi.mock("../../src/middleware/require-user-auth.js", () => ({
  requireUserAuth: () => (req: Request, _res: Response, next: NextFunction) => {
    req.financeUser = { id: USER_ID, issuer: USER_ISSUER, email: "owner@example.test" };
    next();
  },
}));
vi.mock("../../src/modules/tenants/repositories/user-tenant-membership.repository.js", () => ({
  userTenantMembershipRepository: { findActiveMembership: vi.fn() },
}));
vi.mock("../../src/modules/tenants/repositories/tenant-member-management.repository.js", () => ({
  tenantMemberManagementRepository: { update: vi.fn() },
}));

import { userTenantMembershipRepository } from "../../src/modules/tenants/repositories/user-tenant-membership.repository.js";
import { tenantMemberManagementRepository } from "../../src/modules/tenants/repositories/tenant-member-management.repository.js";
import { userTenantMemberManagementRouter } from "../../src/modules/user-auth/routes/user-tenant-member-management.routes.js";

function createApp() {
  const server = express();
  server.use(express.json());
  server.use("/user", userTenantMemberManagementRouter);
  server.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({ error: { code: "INTERNAL_ERROR" } });
  });
  return server;
}

async function patch(server: ReturnType<typeof express>, path: string, body: unknown) {
  const listener = await new Promise<ReturnType<typeof import("node:http").createServer>>((resolve) => {
    const httpServer = server.listen(0, "127.0.0.1", () => resolve(httpServer));
  });
  const address = listener.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind a TCP port");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() as unknown };
  } finally {
    await new Promise<void>((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  }
}

const activeOwner = {
  id: MEMBER_ID,
  tenant_id: TENANT_ID,
  identity_issuer: USER_ISSUER,
  identity_subject: USER_ID,
  role_code: "OWNER" as const,
  status: "ACTIVE" as const,
  activated_at: new Date("2026-10-16T00:00:00.000Z"),
};

describe("PATCH /user/tenants/:tenantId/members/:memberId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(userTenantMembershipRepository.findActiveMembership).mockResolvedValue(activeOwner as never);
    vi.mocked(tenantMemberManagementRepository.update).mockResolvedValue({
      kind: "updated",
      member: { id: MEMBER_ID, role_code: "VIEWER", status: "SUSPENDED", activated_at: activeOwner.activated_at },
    } as never);
  });

  it("rejects invalid IDs and empty updates", async () => {
    const invalidId = await patch(createApp(), "/user/tenants/nope/members/nope", { status: "SUSPENDED" });
    const empty = await patch(createApp(), `/user/tenants/${TENANT_ID}/members/${MEMBER_ID}`, {});
    expect(invalidId.status).toBe(400);
    expect(empty.status).toBe(400);
    expect(tenantMemberManagementRepository.update).not.toHaveBeenCalled();
  });

  it("denies a non-member before attempting an update", async () => {
    vi.mocked(userTenantMembershipRepository.findActiveMembership).mockResolvedValue(null);
    const response = await patch(createApp(), `/user/tenants/${TENANT_ID}/members/${MEMBER_ID}`, { status: "SUSPENDED" });
    expect(response.status).toBe(403);
    expect(tenantMemberManagementRepository.update).not.toHaveBeenCalled();
  });

  it("returns the updated member status and role", async () => {
    const response = await patch(createApp(), `/user/tenants/${TENANT_ID}/members/${MEMBER_ID}`, { role: "VIEWER", status: "SUSPENDED" });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ data: { id: MEMBER_ID, role: "VIEWER", status: "SUSPENDED" } });
    expect(tenantMemberManagementRepository.update).toHaveBeenCalledWith(TENANT_ID, MEMBER_ID, {
      roleCode: "VIEWER", status: "SUSPENDED",
    });
  });

  it("returns a conflict when the target is the last active owner", async () => {
    vi.mocked(tenantMemberManagementRepository.update).mockResolvedValue({ kind: "last_owner" } as never);
    const response = await patch(createApp(), `/user/tenants/${TENANT_ID}/members/${MEMBER_ID}`, { status: "SUSPENDED" });
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ error: { code: "LAST_ACTIVE_OWNER" } });
  });

  it("does not permit unknown fields in the update payload", async () => {
    const response = await patch(createApp(), `/user/tenants/${TENANT_ID}/members/${MEMBER_ID}`, { role: "ADMIN", tenantId: TENANT_ID });
    expect(response.status).toBe(400);
    expect(tenantMemberManagementRepository.update).not.toHaveBeenCalled();
  });
});
