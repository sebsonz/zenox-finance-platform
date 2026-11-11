import express from "express";
import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const TENANT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const INVOICE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CONTEXT = {
  tenantId: TENANT_ID,
  principal: { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", principalCode: "credit-test",
    displayName: "Credit test", scopes: ["invoice:credit", "invoice:read"], allowedTenantIds: [TENANT_ID] },
  correlationId: "credit-note-correlation",
};

vi.mock("../../src/middleware/require-integration-auth.js", () => ({
  requireIntegrationAuth: () => (req: Request, _res: Response, next: NextFunction) => {
    req.financeContext = CONTEXT;
    next();
  },
}));
vi.mock("../../src/modules/invoices/services/credit-note.service.js", () => ({
  CreditNoteServiceError: class CreditNoteServiceError extends Error {
    constructor(readonly code: string, message: string) { super(message); }
  },
  creditNoteService: {
    issueFullReversal: vi.fn(), findDocument: vi.fn(), findPdf: vi.fn(),
  },
}));

import { CreditNoteServiceError, creditNoteService } from "../../src/modules/invoices/services/credit-note.service.js";
import { creditNoteRouter } from "../../src/modules/invoices/routes/credit-note.routes.js";

function app() {
  const server = express();
  server.use(express.json());
  server.use("/invoices", creditNoteRouter);
  server.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({ error: { code: "INTERNAL_ERROR" } });
  });
  return server;
}
async function request(path: string, init?: RequestInit) {
  const server = app();
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

describe("credit note routes", () => {
  beforeEach(() => vi.clearAllMocks());
  it("requires a strict reason and a valid source invoice ID", async () => {
    const invalidId = await request("/invoices/not-a-uuid/credit-notes", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason: "Correction" }),
    });
    expect(invalidId.status).toBe(400);
    const invalidBody = await request(`/invoices/${INVOICE_ID}/credit-notes`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason: "x", grandTotal: "0" }),
    });
    expect(invalidBody.status).toBe(400);
    expect(creditNoteService.issueFullReversal).not.toHaveBeenCalled();
  });
  it("issues a credit note and returns its authoritative immutable document references", async () => {
    vi.mocked(creditNoteService.issueFullReversal).mockResolvedValue({
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", originalInvoiceId: INVOICE_ID,
      creditNoteCode: "CN-2026-000123", status: "ISSUED", reason: "Full reversal",
      currencyCode: "XOF", grandTotal: "2360.00000000", amountDue: "2360.0000",
      htmlSha256: "a".repeat(64), pdfSha256: "b".repeat(64), issuedAt: "2026-10-16T22:00:00.000000Z",
    });
    const response = await request(`/invoices/${INVOICE_ID}/credit-notes`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason: "Full reversal" }),
    });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ data: { creditNote: { creditNoteCode: "CN-2026-000123", status: "ISSUED" } } });
  });
  it("maps duplicate full reversals to conflict", async () => {
    vi.mocked(creditNoteService.issueFullReversal).mockRejectedValue(
      new CreditNoteServiceError("CREDIT_NOTE_ALREADY_EXISTS", "Already reversed."),
    );
    const response = await request(`/invoices/${INVOICE_ID}/credit-notes`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason: "Full reversal" }),
    });
    expect(response.status).toBe(409);
  });
});
