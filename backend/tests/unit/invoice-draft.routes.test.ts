import express from "express";
import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const TENANT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PRINCIPAL_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CUSTOMER_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const INVOICE_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const UPDATED_AT = "2026-10-16T21:00:00.000Z";
const CONTEXT = {
  tenantId: TENANT_ID,
  principal: { id: PRINCIPAL_ID, principalCode: "ci-integration", displayName: "CI", scopes: ["invoice:draft:write", "invoice:read"], allowedTenantIds: [TENANT_ID] },
  correlationId: "test-correlation",
};

vi.mock("../../src/middleware/require-integration-auth.js", () => ({
  requireIntegrationAuth: () => (req: Request, _res: Response, next: NextFunction) => {
    req.financeContext = CONTEXT;
    next();
  },
}));
vi.mock("../../src/modules/invoices/services/invoice-draft.service.js", () => ({
  InvoiceDraftServiceError: class InvoiceDraftServiceError extends Error {
    constructor(readonly code: string, message: string) { super(message); }
  },
  invoiceDraftService: { create: vi.fn(), updateDraft: vi.fn(), findById: vi.fn(), list: vi.fn() },
}));

import { invoiceDraftService, InvoiceDraftServiceError } from "../../src/modules/invoices/services/invoice-draft.service.js";
import { invoiceDraftRouter } from "../../src/modules/invoices/routes/invoice-draft.routes.js";

function app() {
  const server = express();
  server.use(express.json());
  server.use("/invoices", invoiceDraftRouter);
  server.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({ error: { code: "INTERNAL_ERROR" } });
  });
  return server;
}

async function request(server: ReturnType<typeof express>, path: string, init?: RequestInit) {
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

const validBody = {
  customerId: CUSTOMER_ID,
  currencyCode: "XOF",
  dueDate: "2026-11-15",
  notes: "Updated draft",
  expectedUpdatedAt: UPDATED_AT,
  lines: [{ description: "Transport", quantity: "2", unitPrice: "15000", taxRatePercent: "18" }],
};

describe("invoice draft API routes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects client-supplied totals before calling the service", async () => {
    const response = await request(app(), "/invoices/drafts", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ customerId: CUSTOMER_ID, currencyCode: "XOF", lines: validBody.lines, grandTotal: "1" }),
    });
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: { code: "INVALID_REQUEST" } });
    expect(invoiceDraftService.create).not.toHaveBeenCalled();
  });

  it("creates a draft and returns 201 with the correlation ID", async () => {
    vi.mocked(invoiceDraftService.create).mockResolvedValue({ id: INVOICE_ID, status: "DRAFT" } as never);
    const response = await request(app(), "/invoices/drafts", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ customerId: CUSTOMER_ID, currencyCode: "XOF", lines: validBody.lines }),
    });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ data: { invoice: { status: "DRAFT" }, correlationId: "test-correlation" } });
    expect(invoiceDraftService.create).toHaveBeenCalledWith(CONTEXT, expect.objectContaining({ currencyCode: "XOF" }));
  });

  it("requires the expected version and complete strict body for draft updates", async () => {
    const { expectedUpdatedAt: _ignored, ...missingVersion } = validBody;
    const response = await request(app(), `/invoices/drafts/${INVOICE_ID}`, {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(missingVersion),
    });
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: { code: "INVALID_REQUEST" } });
    expect(invoiceDraftService.updateDraft).not.toHaveBeenCalled();
  });

  it("updates a draft and passes the optimistic concurrency token", async () => {
    vi.mocked(invoiceDraftService.updateDraft).mockResolvedValue({ id: INVOICE_ID, status: "DRAFT", grandTotal: "35400" } as never);
    const response = await request(app(), `/invoices/drafts/${INVOICE_ID}`, {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(validBody),
    });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      data: { invoice: { id: INVOICE_ID, status: "DRAFT" }, correlationId: "test-correlation" },
    });
    expect(invoiceDraftService.updateDraft).toHaveBeenCalledWith(
      CONTEXT,
      INVOICE_ID,
      expect.objectContaining({ expectedUpdatedAt: UPDATED_AT, currencyCode: "XOF" }),
    );
  });

  it("maps a concurrent/stale update to 409 Conflict", async () => {
    vi.mocked(invoiceDraftService.updateDraft).mockRejectedValue(
      new InvoiceDraftServiceError("DRAFT_NOT_FOUND_OR_CHANGED", "Reload the draft before retrying."),
    );
    const response = await request(app(), `/invoices/drafts/${INVOICE_ID}`, {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(validBody),
    });
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ error: { code: "DRAFT_NOT_FOUND_OR_CHANGED" } });
  });

  it("validates invoice identifiers before querying the service", async () => {
    const response = await request(app(), "/invoices/drafts/not-a-uuid");
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: { code: "INVALID_INVOICE_ID" } });
    expect(invoiceDraftService.findById).not.toHaveBeenCalled();
  });

  it("returns tenant-scoped invoice detail when found", async () => {
    vi.mocked(invoiceDraftService.findById).mockResolvedValue({ id: INVOICE_ID, status: "DRAFT" } as never);
    const response = await request(app(), `/invoices/drafts/${INVOICE_ID}`);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ data: { invoice: { id: INVOICE_ID }, correlationId: "test-correlation" } });
    expect(invoiceDraftService.findById).toHaveBeenCalledWith(CONTEXT, INVOICE_ID);
  });
});
