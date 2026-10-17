import express from "express";
import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const USER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER_ISSUER = "https://auth.example.test";

vi.mock("../../src/middleware/require-user-auth.js", () => ({
  requireUserAuth: () => (req: Request, _res: Response, next: NextFunction) => {
    req.financeUser = { id: USER_ID, issuer: USER_ISSUER, email: "user@example.test" };
    next();
  },
}));
vi.mock("../../src/modules/tenants/repositories/user-tenant-directory.repository.js", () => ({
  userTenantDirectoryRepository: { listActiveTenantsForIdentity: vi.fn() },
}));

import { userTenantDirectoryRepository } from "../../src/modules/tenants/repositories/user-tenant-directory.repository.js";
import { userTenantDirectoryRouter } from "../../src/modules/user-auth/routes/user-tenant-directory.routes.js";

function app() {
  const server = express();
  server.use("/user", userTenantDirectoryRouter);
  server.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({ error: { code: "INTERNAL_ERROR" } });
  });
  return server;
}

async function get(server: ReturnType<typeof express>) {
  const listener = await new Promise<ReturnType<typeof import("node:http").createServer>>((resolve) => {
    const httpServer = server.listen(0, "127.0.0.1", () => resolve(httpServer));
  });
  const address = listener.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind a TCP port");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/user/tenants`);
    return { status: response.status, headers: response.headers, body: await response.json() as unknown };
  } finally {
    await new Promise<void>((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  }
}

describe("GET /user/tenants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns active tenant directory entries for the verified identity", async () => {
    vi.mocked(userTenantDirectoryRepository.listActiveTenantsForIdentity).mockResolvedValue([
      { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", tenant_code: "ITEST_ALPHA", legal_name: "Alpha SARL", role_code: "OWNER" },
      { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", tenant_code: "ITEST_BETA", legal_name: "Beta SARL", role_code: "VIEWER" },
    ]);
    const response = await get(app());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.body).toMatchObject({
      data: {
        tenants: [
          { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", tenantCode: "ITEST_ALPHA", legalName: "Alpha SARL", role: "OWNER" },
          { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", tenantCode: "ITEST_BETA", legalName: "Beta SARL", role: "VIEWER" },
        ],
      },
    });
    expect(userTenantDirectoryRepository.listActiveTenantsForIdentity).toHaveBeenCalledWith(USER_ISSUER, USER_ID);
  });

  it("returns an empty list when the verified identity has no active tenant memberships", async () => {
    vi.mocked(userTenantDirectoryRepository.listActiveTenantsForIdentity).mockResolvedValue([]);
    const response = await get(app());
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ data: { tenants: [] } });
  });

  it("forwards repository errors to the API error handler", async () => {
    vi.mocked(userTenantDirectoryRepository.listActiveTenantsForIdentity).mockRejectedValue(new Error("database unavailable"));
    const response = await get(app());
    expect(response.status).toBe(500);
    expect(response.body).toMatchObject({ error: { code: "INTERNAL_ERROR" } });
  });
});
