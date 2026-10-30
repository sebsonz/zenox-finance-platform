import express from "express";
import type { NextFunction, Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    issuer: "https://platform-auth.example.test",
    emailConfirmedAt: "2026-10-30T08:00:00.000Z" as string | null,
  } as { id: string; issuer: string; emailConfirmedAt?: string | null } | undefined,
  assertActiveOperator: vi.fn(),
  execute: vi.fn(),
  requireUserAuth: vi.fn(() => (req: Request, _res: Response, next: NextFunction) => {
    if (mocks.user) req.financeUser = mocks.user;
    else delete req.financeUser;
    next();
  }),
}));

vi.mock("../../src/middleware/require-user-auth.js", () => ({ requireUserAuth: mocks.requireUserAuth }));
vi.mock("../../src/modules/platform-admin/services/platform-admin-access.service.js", () => ({
  PlatformAdminAccessError: class PlatformAdminAccessError extends Error {
    constructor(readonly code: string, readonly status: number, message: string) { super(message); }
  },
  platformAdminAccessService: { assertActiveOperator: mocks.assertActiveOperator },
}));
vi.mock("../../src/modules/tax/application/list-tax-jurisdictions.use-case.js", () => ({
  listTaxJurisdictions: { execute: mocks.execute },
}));

import { platformAdminRouter } from "../../src/modules/platform-admin/routes/platform-admin.routes.js";

function createApp() {
  const app = express();
  app.use("/platform-admin", platformAdminRouter);
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({ error: { code: "INTERNAL_ERROR" } });
  });
  return app;
}

async function request(path: string) {
  const app = createApp();
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind a TCP port");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`);
    return {
      status: response.status,
      headers: response.headers,
      body: await response.json() as unknown,
    };
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

describe("platform admin tax jurisdiction route", () => {
  beforeEach(() => {
    mocks.user = {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      issuer: "https://platform-auth.example.test",
      emailConfirmedAt: "2026-10-30T08:00:00.000Z",
    };
    mocks.assertActiveOperator.mockResolvedValue(undefined);
    mocks.execute.mockResolvedValue({
      items: [{
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        code: "BJ",
        countryCode: "BJ",
        name: "Bénin",
        jurisdictionLevel: "COUNTRY",
        parentId: null,
        isActive: true,
      }],
      page: 1,
      pageSize: 25,
      hasMore: false,
    });
  });

  afterEach(() => vi.clearAllMocks());

  it("rejects a missing user session before querying tax data", async () => {
    mocks.user = undefined;
    const response = await request("/platform-admin/tax/jurisdictions");
    expect(response.status).toBe(401);
    expect(mocks.assertActiveOperator).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("requires an active platform operator", async () => {
    const { PlatformAdminAccessError } = await import("../../src/modules/platform-admin/services/platform-admin-access.service.js");
    mocks.assertActiveOperator.mockRejectedValue(new PlatformAdminAccessError(
      "PLATFORM_OPERATOR_REQUIRED", 403, "Forbidden",
    ));
    const response = await request("/platform-admin/tax/jurisdictions");
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ error: { code: "PLATFORM_OPERATOR_REQUIRED" } });
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("validates filters before executing the tax query", async () => {
    const response = await request("/platform-admin/tax/jurisdictions?countryCode=ben&page=0");
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("returns a no-store paginated result for a verified platform operator", async () => {
    const response = await request("/platform-admin/tax/jurisdictions?countryCode=BJ&level=COUNTRY&page=1&pageSize=25");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.assertActiveOperator).toHaveBeenCalledWith(mocks.user);
    expect(mocks.execute).toHaveBeenCalledWith({
      countryCode: "BJ",
      level: "COUNTRY",
      page: 1,
      pageSize: 25,
    });
    expect(response.body).toMatchObject({ data: { page: 1, pageSize: 25, hasMore: false } });
  });
});
