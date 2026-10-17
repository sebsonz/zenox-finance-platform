import express from "express";
import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyRequestUser = vi.fn();
const userSessionCookie = vi.fn((token: string) => `zenox_finance_session=${token}; Path=/api/v1/user; Max-Age=3600; HttpOnly; SameSite=Lax`);
const clearUserSessionCookie = vi.fn(() => "zenox_finance_session=; Path=/api/v1/user; Max-Age=0; HttpOnly; SameSite=Lax");
const requireUserAuth = vi.fn(() => (req: Request, _res: Response, next: NextFunction) => {
  req.financeUser = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", issuer: "https://auth.example.test", email: "user@example.test" };
  next();
});

vi.mock("../../src/config/env.js", () => ({
  env: {
    NODE_ENV: "test",
    SUPABASE_URL: "https://auth.example.test",
    SUPABASE_ANON_KEY: "public-anon-key-for-tests-long-enough",
  },
}));
vi.mock("../../src/middleware/require-user-auth.js", () => ({
  clearUserSessionCookie,
  requireUserAuth,
  userSessionCookie,
  verifyRequestUser,
}));

import { userSessionRouter } from "../../src/modules/user-auth/routes/user-session.routes.js";

function app() {
  const server = express();
  server.use(express.json());
  server.use("/user", userSessionRouter);
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
        ...(options.origin === undefined ? {} : { origin: options.origin }),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
    return { status: response.status, headers: response.headers, body: response.status === 204 ? null : await response.json() as unknown };
  } finally {
    await new Promise<void>((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  }
}

describe("user BFF session routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyRequestUser.mockResolvedValue({ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", email: "user@example.test" });
  });

  it("rejects session exchange requests without a same-origin Origin header", async () => {
    const response = await request(app(), "POST", "/user/session", { body: { accessToken: "a".repeat(40) } });
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ error: { code: "ORIGIN_NOT_ALLOWED" } });
    expect(verifyRequestUser).not.toHaveBeenCalled();
  });

  it("rejects malformed session exchange bodies", async () => {
    const response = await request(app(), "POST", "/user/session", {
      origin: "http://127.0.0.1",
      body: { accessToken: "short" },
    });
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: { code: "INVALID_SESSION_EXCHANGE" } });
  });

  it("verifies the token server-side and sets an HttpOnly cookie", async () => {
    const token = "a".repeat(40);
    const response = await request(app(), "POST", "/user/session", {
      origin: "http://127.0.0.1",
      body: { accessToken: token },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=Lax");
    expect(response.body).toMatchObject({ data: { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" } });
    expect(verifyRequestUser).toHaveBeenCalledWith(token);
  });

  it("clears the HttpOnly session cookie on same-origin logout", async () => {
    const response = await request(app(), "DELETE", "/user/session", { origin: "http://127.0.0.1" });
    expect(response.status).toBe(204);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(clearUserSessionCookie).toHaveBeenCalledOnce();
  });

  it("rejects cross-origin logout", async () => {
    const response = await request(app(), "DELETE", "/user/session", { origin: "https://attacker.example" });
    expect(response.status).toBe(403);
    expect(clearUserSessionCookie).not.toHaveBeenCalled();
  });
});
