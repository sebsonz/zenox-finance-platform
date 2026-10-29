import express from "express";
import type { NextFunction, Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    issuer: "https://platform-auth.example.test",
    email: "operator@example.test",
    emailConfirmedAt: "2026-10-20T10:00:00.000Z" as string | null,
  } as { id: string; issuer: string; email?: string; emailConfirmedAt?: string | null } | undefined,
  isPlatformOperator: vi.fn(),
  listPendingForOperator: vi.fn(),
  review: vi.fn(),
  requireUserAuth: vi.fn(() => (req: Request, _res: Response, next: NextFunction) => {
    if (mocks.user) req.financeUser = mocks.user;
    else delete req.financeUser;
    next();
  }),
}));

vi.mock("../../src/middleware/require-user-auth.js", () => ({ requireUserAuth: mocks.requireUserAuth }));
vi.mock("../../src/modules/registration/repositories/registration.repository.js", () => ({
  registrationRepository: {
    isPlatformOperator: mocks.isPlatformOperator,
    listPendingForOperator: mocks.listPendingForOperator,
    review: mocks.review,
  },
}));

import { platformRegistrationRouter } from "../../src/modules/registration/routes/platform-registration.routes.js";

function app() {
  const server = express();
  server.use(express.json());
  server.use((req, res, next) => {
    res.locals["correlationId"] = req.header("x-correlation-id") ?? "platform-review-test";
    next();
  });
  server.use("/platform", platformRegistrationRouter);
  server.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({ error: { code: "INTERNAL_ERROR" } });
  });
  return server;
}

async function request(
  server: ReturnType<typeof express>,
  method: string,
  path: string,
  options: { body?: unknown; origin?: string } = {},
) {
  const listener = await new Promise<ReturnType<typeof import("node:http").createServer>>((resolve) => {
    const httpServer = server.listen(0, "127.0.0.1", () => resolve(httpServer));
  });
  const address = listener.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind a TCP port");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
      method,
      headers: {
        ...(options.body === undefined ? {} : { "content-type": "application/json" }),
        ...(options.origin === undefined ? {} : { origin: options.origin === "SAME_ORIGIN" ? `http://127.0.0.1:${address.port}` : options.origin }),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
    return { status: response.status, headers: response.headers, body: response.status === 204 ? null : await response.json() as unknown };
  } finally {
    await new Promise<void>((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  }
}

describe("platform registration review routes", () => {
  beforeEach(() => {
    mocks.user = {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      issuer: "https://platform-auth.example.test",
      email: "operator@example.test",
      emailConfirmedAt: "2026-10-20T10:00:00.000Z",
    };
    mocks.isPlatformOperator.mockResolvedValue(true);
    mocks.listPendingForOperator.mockResolvedValue([]);
    mocks.review.mockResolvedValue({
      request_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      tenant_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      status: "APPROVED",
      decided_at: new Date("2026-10-20T10:00:00.000Z"),
    });
  });

  afterEach(() => vi.clearAllMocks());

  it("requires an authenticated session before platform privilege is checked", async () => {
    mocks.user = undefined;
    const response = await request(app(), "GET", "/platform/me");
    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ error: { code: "UNAUTHENTICATED" } });
    expect(mocks.isPlatformOperator).not.toHaveBeenCalled();
  });

  it("allows a verified platform operator without requiring tenant membership", async () => {
    const response = await request(app(), "GET", "/platform/me");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.body).toMatchObject({ data: { isPlatformOperator: true } });
    expect(mocks.isPlatformOperator).toHaveBeenCalledWith(
      "https://platform-auth.example.test",
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    );
  });

  it("does not authorize a normal user as a platform operator", async () => {
    mocks.isPlatformOperator.mockResolvedValue(false);
    const response = await request(app(), "GET", "/platform/me");
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ error: { code: "PLATFORM_OPERATOR_REQUIRED" } });
    expect(mocks.listPendingForOperator).not.toHaveBeenCalled();
  });

  it("requires confirmed email and operator membership before listing requests", async () => {
    mocks.user = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", issuer: "https://platform-auth.example.test", emailConfirmedAt: null };
    const response = await request(app(), "GET", "/platform/registration-requests");
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ error: { code: "EMAIL_CONFIRMATION_REQUIRED" } });
    expect(mocks.listPendingForOperator).not.toHaveBeenCalled();
  });

  it("requires same-origin POST and a rejection reason", async () => {
    const requestId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const crossOrigin = await request(app(), "POST", `/platform/registration-requests/${requestId}/decision`, {
      origin: "https://attacker.example",
      body: { decision: "APPROVE" },
    });
    expect(crossOrigin.status).toBe(403);
    expect(mocks.review).not.toHaveBeenCalled();

    const invalidReason = await request(app(), "POST", `/platform/registration-requests/${requestId}/decision`, {
      origin: "SAME_ORIGIN",
      body: { decision: "REJECT", reason: "no" },
    });
    expect(invalidReason.status).toBe(400);
    expect(mocks.review).not.toHaveBeenCalled();
  });

  it("passes only the verified operator identity to the review repository", async () => {
    const response = await request(app(), "POST", "/platform/registration-requests/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/decision", {
      origin: "SAME_ORIGIN",
      body: { decision: "APPROVE" },
    });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ data: { request: { status: "APPROVED" } } });
    expect(mocks.review).toHaveBeenCalledWith(expect.objectContaining({
      operatorIssuer: "https://platform-auth.example.test",
      operatorSubject: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      decision: "APPROVE",
      rejectionReason: null,
    }));
  });
});
