import express from "express";
import type { NextFunction, Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    issuer: "https://auth.example.test",
    email: "owner@example.test",
    emailConfirmedAt: "2026-10-20T10:00:00.000Z" as string | null,
  } as { id: string; issuer: string; email?: string; emailConfirmedAt?: string | null } | undefined,
  submit: vi.fn(),
  listMine: vi.fn(),
  findMine: vi.fn(),
  listActive: vi.fn(),
  requireUserAuth: vi.fn(() => (req: Request, _res: Response, next: NextFunction) => {
    req.financeUser = mocks.user;
    next();
  }),
}));

vi.mock("../../src/middleware/require-user-auth.js", () => ({ requireUserAuth: mocks.requireUserAuth }));
vi.mock("../../src/modules/registration/repositories/registration.repository.js", () => ({
  registrationRepository: {
    submit: mocks.submit,
    listMine: mocks.listMine,
    findMine: mocks.findMine,
  },
}));
vi.mock("../../src/modules/currencies/repositories/currency.repository.js", () => ({
  currencyRepository: { listActive: mocks.listActive },
}));

import { registrationRouter } from "../../src/modules/registration/routes/registration.routes.js";

function app() {
  const server = express();
  server.use(express.json());
  server.use((req, res, next) => {
    res.locals["correlationId"] = req.header("x-correlation-id") ?? "test-correlation";
    next();
  });
  server.use("/registration", registrationRouter);
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

describe("organization registration routes", () => {
  beforeEach(() => {
    mocks.user = {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      issuer: "https://auth.example.test",
      email: "owner@example.test",
      emailConfirmedAt: "2026-10-20T10:00:00.000Z",
    };
    mocks.submit.mockResolvedValue({
      request_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      tenant_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      status: "PENDING",
      submitted_at: new Date("2026-10-20T10:00:00.000Z"),
    });
    mocks.listMine.mockResolvedValue([]);
    mocks.findMine.mockResolvedValue(null);
    mocks.listActive.mockResolvedValue([{ code: "XOF", name: "CFA franc BCEAO", minorUnit: 0 }]);
  });

  afterEach(() => vi.clearAllMocks());

  it("rejects registration submission without a same-origin request", async () => {
    const response = await request(app(), "POST", "/registration/organizations", {
      body: { legalName: "Example Ltd", countryCode: "BJ", defaultCurrency: "XOF", acceptedTermsVersion: "2026-10-draft" },
    });
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ error: { code: "ORIGIN_NOT_ALLOWED" } });
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("requires authoritative email confirmation before organization submission", async () => {
    mocks.user = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", issuer: "https://auth.example.test", emailConfirmedAt: null };
    const response = await request(app(), "POST", "/registration/organizations", {
      origin: "SAME_ORIGIN",
      body: { legalName: "Example Ltd", countryCode: "BJ", defaultCurrency: "XOF", acceptedTermsVersion: "2026-10-draft" },
    });
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ error: { code: "EMAIL_CONFIRMATION_REQUIRED" } });
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("creates a pending request using only the verified identity context", async () => {
    const response = await request(app(), "POST", "/registration/organizations", {
      origin: "SAME_ORIGIN",
      body: {
        legalName: "  Example Logistics Ltd ",
        countryCode: "bj",
        defaultCurrency: "xof",
        acceptedTermsVersion: "2026-10-draft",
        identitySubject: "attacker-controlled-value",
        role: "OWNER",
      },
    });
    expect(response.status).toBe(400);
    expect(mocks.submit).not.toHaveBeenCalled();

    const valid = await request(app(), "POST", "/registration/organizations", {
      origin: "SAME_ORIGIN",
      body: { legalName: "Example Logistics Ltd", countryCode: "bj", defaultCurrency: "xof", acceptedTermsVersion: "2026-10-draft" },
    });
    expect(valid.status).toBe(202);
    expect(valid.body).toMatchObject({ request: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", status: "PENDING" } });
    expect(mocks.submit).toHaveBeenCalledWith(expect.objectContaining({
      identityIssuer: "https://auth.example.test",
      identitySubject: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      legalName: "Example Logistics Ltd",
      countryCode: "BJ",
      defaultCurrency: "XOF",
    }));
  });

  it("returns only requests resolved for the verified identity", async () => {
    mocks.listMine.mockResolvedValue([{
      request_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      tenant_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      legal_name: "Example Ltd",
      country_code: "BJ",
      default_currency: "XOF",
      status: "PENDING",
      submitted_at: new Date("2026-10-20T10:00:00.000Z"),
      updated_at: new Date("2026-10-20T10:00:00.000Z"),
      rejection_reason: null,
    }]);
    const response = await request(app(), "GET", "/registration/organizations");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.body).toMatchObject({ data: { requests: [{ legalName: "Example Ltd", status: "PENDING" }] } });
    expect(mocks.listMine).toHaveBeenCalledWith("https://auth.example.test", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
  });

  it("does not disclose requests belonging to another identity", async () => {
    const response = await request(app(), "GET", "/registration/organizations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ error: { code: "REGISTRATION_NOT_FOUND" } });
  });
});
