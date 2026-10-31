import express from "express";
import type { NextFunction, Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    issuer: "https://auth.example.test",
    emailConfirmedAt: "2026-10-31T10:00:00.000Z" as string | null,
  } as { id: string; issuer: string; emailConfirmedAt?: string | null } | undefined,
  createOrSaveDraft: vi.fn(),
  updateDraft: vi.fn(),
  getDraft: vi.fn(),
  getCurrentDraft: vi.fn(),
  submitDraft: vi.fn(),
  listMine: vi.fn(),
  requireUserAuth: vi.fn(() => (req: Request, _res: Response, next: NextFunction) => {
    if (mocks.user) req.financeUser = mocks.user;
    else delete req.financeUser;
    next();
  }),
}));

vi.mock("../../src/middleware/require-user-auth.js", () => ({ requireUserAuth: mocks.requireUserAuth }));
vi.mock("../../src/modules/onboarding/application/onboarding.service.js", () => ({
  onboardingService: {
    createOrSaveDraft: mocks.createOrSaveDraft,
    updateDraft: mocks.updateDraft,
    getDraft: mocks.getDraft,
    getCurrentDraft: mocks.getCurrentDraft,
    submitDraft: mocks.submitDraft,
    listMine: mocks.listMine,
  },
}));

import { onboardingRouter } from "../../src/modules/onboarding/routes/onboarding.routes.js";

function app() {
  const server = express();
  server.use(express.json());
  server.use((req, res, next) => {
    res.locals["correlationId"] = "onboarding-test";
    next();
  });
  server.use("/registration", onboardingRouter);
  server.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({ error: { code: "INTERNAL_ERROR" } });
  });
  return server;
}

async function request(
  server: ReturnType<typeof express>,
  method: string,
  path: string,
  body?: unknown,
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
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        origin: `http://127.0.0.1:${address.port}`,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, headers: response.headers, body: await response.json() as unknown };
  } finally {
    await new Promise<void>((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  }
}

const payload = {
  organization: { legalName: "Example SARL", tradeName: null, legalForm: "SARL", countryCode: "BJ", defaultCurrency: "XOF", registrationNumber: null },
  address: { addressType: "REGISTERED", addressLine1: "Rue du Port", addressLine2: null, city: "Cotonou", region: "Littoral", postalCode: null, countryCode: "BJ" },
  representative: { fullName: "Example Owner", role: "Gérant", email: "owner@example.test", phone: null },
  contact: { businessEmail: "contact@example.test", businessPhone: null, websiteUrl: null },
};

describe("M02 onboarding routes", () => {
  beforeEach(() => {
    mocks.user = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", issuer: "https://auth.example.test", emailConfirmedAt: "2026-10-31T10:00:00.000Z" };
    mocks.createOrSaveDraft.mockResolvedValue({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", payload, status: "DRAFT" });
    mocks.updateDraft.mockResolvedValue({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", payload, status: "DRAFT" });
    mocks.getDraft.mockResolvedValue({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", payload, status: "DRAFT" });
    mocks.getCurrentDraft.mockResolvedValue(null);
    mocks.submitDraft.mockResolvedValue({ requestId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", tenantId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", status: "PENDING", submittedAt: "2026-10-31T10:00:00.000Z" });
    mocks.listMine.mockResolvedValue([]);
  });

  afterEach(() => vi.clearAllMocks());

  it("requires confirmed identity before draft creation", async () => {
    mocks.user = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", issuer: "https://auth.example.test", emailConfirmedAt: null };
    const response = await request(app(), "POST", "/registration/drafts", payload);
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ error: { code: "EMAIL_CONFIRMATION_REQUIRED" } });
    expect(mocks.createOrSaveDraft).not.toHaveBeenCalled();
  });

  it("rejects cross-origin draft writes", async () => {
    const server = express();
    server.use(express.json());
    server.use("/registration", onboardingRouter);
    const listener = await new Promise<ReturnType<typeof import("node:http").createServer>>((resolve) => {
      const httpServer = server.listen(0, "127.0.0.1", () => resolve(httpServer));
    });
    const address = listener.address();
    if (!address || typeof address === "string") throw new Error("Test server did not bind");
    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/registration/drafts`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://attacker.example" },
        body: JSON.stringify(payload),
      });
      expect(response.status).toBe(403);
      expect(mocks.createOrSaveDraft).not.toHaveBeenCalled();
    } finally {
      await new Promise<void>((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
    }
  });

  it("creates a draft using the authenticated identity and never body-supplied identity", async () => {
    const response = await request(app(), "POST", "/registration/drafts", { ...payload, identitySubject: "forged" });
    expect(response.status).toBe(400);
    expect(mocks.createOrSaveDraft).not.toHaveBeenCalled();

    const valid = await request(app(), "POST", "/registration/drafts", payload);
    expect(valid.status).toBe(200);
    expect(valid.body).toMatchObject({ data: { draft: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", status: "DRAFT" } } });
    expect(mocks.createOrSaveDraft).toHaveBeenCalledWith(expect.objectContaining({
      identityIssuer: "https://auth.example.test",
      identitySubject: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    }), expect.objectContaining({ organization: expect.objectContaining({ legalName: "Example SARL" }) }));
  });

  it("submits only with separate terms and privacy consent versions", async () => {
    const invalid = await request(app(), "POST", "/registration/drafts/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/submit", { acceptedTermsVersion: "terms-v1" });
    expect(invalid.status).toBe(400);
    expect(mocks.submitDraft).not.toHaveBeenCalled();

    const valid = await request(app(), "POST", "/registration/drafts/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/submit", {
      acceptedTermsVersion: "terms-v1",
      acceptedPrivacyVersion: "privacy-v1",
    });
    expect(valid.status).toBe(202);
    expect(mocks.submitDraft).toHaveBeenCalledWith(expect.objectContaining({
      identitySubject: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      correlationId: "onboarding-test",
    }), "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "terms-v1", "privacy-v1");
  });
});
