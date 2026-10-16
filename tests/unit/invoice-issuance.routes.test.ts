import express from "express";
import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const TENANT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PRINCIPAL_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const INVOICE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const UPDATED_AT = "2026-10-16T21:00:00.000Z";
const CONTEXT = {
  tenantId: TENANT_ID,
  principal: {
    id: PRINCIPAL_ID,
    principalCode: "ci-integration",
    displayName: "CI Integration",
    scopes: ["invoice:issue"],
    allowedTenantIds: [TENANT_ID],
  },
  correlationId: "test-issue-correlation",
};

vi.mock("../../src/middleware/require-integration-auth.js", () => ({
  requireIntegrationAuth: (requiredScopes: string[] = []) =>
    (req: Request, res: Response, next: NextFunction) => {
      if (!requiredScopes.every((scope) => CONTEXT.principal.scopes.includes(scope))) {
        res.status(403).json({ error: { code: "INSUFFICIENT_SCOPE" } });
        return;
      }
      req.financeContext = CONTEXT;
      next();
    },
}));

vi.mock("../../src/modules/invoices/services/invoice-issuance.service.js", () => ({
  InvoiceIssuanceServiceError: class InvoiceIssuanceServiceError extends Error {
    constructor(readonly code: string, message: string) { super(message); }
  },
  invoiceIssuanceService: { issue: vi.fn() },
}));

import {
  InvoiceIssuanceServiceError,
  invoiceIssuanceService,
} from "../../src/modules/invoices/services/invoice-issuance.service.js";
import { invoiceIssuanceRouter } from "../../src/modules/invoices/routes/invoice-issuance.routes.js";

function app() {
  const server = express();
  server.use(express.json());
  server.use("/invoices", invoiceIssuanceRouter);
  server.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({ error: { code: "INTERNAL_ERROR" } });
  });
  return server;
}

async function request(server: ReturnType<typeof express>, path: string, init: RequestInit) {
  const listener = await new Promise<ReturnType<typeof import("node:http").createServer>>((resolve) => {
    const httpServer = server.listen(0, "127.0.0.1", () => resolve(httpServer));
  });
  const address = listener.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind a TCP port");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, init);
    return { status: response.status, body: await response.json() as unknown };
  } finally {
    await new Promise<void>((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  }
}

describe("invoice issuance route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("validates invoice ID and requires a strict expected revision", async () => {
    const invalidId = await request(app(), "/invoices/not-a-uuid/issue", {
      method: "POST", headers: { "content-type": "application/json", "Idempotency-Key": "test-issue-key-001" },
      body: JSON.stringify({ expectedUpdatedAt: UPDATED_AT }),
    });
    expect(invalidId.status).toBe(400);
    expect(invalidId.body).toMatchObject({ error: { code: "INVALID_INVOICE_ID" } });

    const invalidBody = await request(app(), `/invoices/${INVOICE_ID}/issue`, {
      method: "POST", headers: { "content-type": "application/json", "Idempotency-Key": "test-issue-key-001" },
      body: JSON.stringify({ expectedUpdatedAt: UPDATED_AT, invoiceCode: "INV-2026-000001" }),
    });
    expect(invalidBody.status).toBe(400);
    expect(invalidBody.body).toMatchObject({ error: { code: "INVALID_REQUEST" } });
    expect(invoiceIssuanceService.issue).not.toHaveBeenCalled();
  });

  it("issues the invoice and returns the authoritative allocated code", async () => {
    vi.mocked(invoiceIssuanceService.issue).mockResolvedValue({
      id: INVOICE_ID, status: "ISSUED", invoiceCode: "INV-2026-000001", taxStatus: "CALCULATED",
    } as never);
    const response = await request(app(), `/invoices/${INVOICE_ID}/issue`, {
      method: "POST", headers: { "content-type": "application/json", "Idempotency-Key": "test-issue-key-001" },
      body: JSON.stringify({ expectedUpdatedAt: UPDATED_AT }),
    });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      data: { invoice: { status: "ISSUED", invoiceCode: "INV-2026-000001" }, correlationId: "test-issue-correlation" },
    });
    expect(invoiceIssuanceService.issue).toHaveBeenCalledWith(CONTEXT, INVOICE_ID, UPDATED_AT, "test-issue-key-001");
  });

  it("maps stale or already-issued revisions to 409", async () => {
    vi.mocked(invoiceIssuanceService.issue).mockRejectedValue(
      new InvoiceIssuanceServiceError("INVOICE_NOT_FOUND_OR_CHANGED", "Reload the draft."),
    );
    const response = await request(app(), `/invoices/${INVOICE_ID}/issue`, {
      method: "POST", headers: { "content-type": "application/json", "Idempotency-Key": "test-issue-key-001" },
      body: JSON.stringify({ expectedUpdatedAt: UPDATED_AT }),
    });
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ error: { code: "INVOICE_NOT_FOUND_OR_CHANGED" } });
  });

  it("refuses issuance without an authoritative tax snapshot", async () => {
    vi.mocked(invoiceIssuanceService.issue).mockRejectedValue(
      new InvoiceIssuanceServiceError("INVOICE_TAX_NOT_CALCULATED", "Tax snapshot required."),
    );
    const response = await request(app(), `/invoices/${INVOICE_ID}/issue`, {
      method: "POST", headers: { "content-type": "application/json", "Idempotency-Key": "test-issue-key-001" },
      body: JSON.stringify({ expectedUpdatedAt: UPDATED_AT }),
    });
    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ error: { code: "INVOICE_TAX_NOT_CALCULATED" } });
  });
});
