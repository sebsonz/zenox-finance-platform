import express from "express";
import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const TENANT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const INVOICE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CONTEXT = {
  tenantId: TENANT_ID,
  principal: {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    principalCode: "ci-integration",
    displayName: "CI Integration",
    scopes: ["invoice:read"],
    allowedTenantIds: [TENANT_ID],
  },
  correlationId: "test-document-correlation",
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

vi.mock("../../src/modules/invoices/services/invoice-document.service.js", () => ({
  invoiceDocumentService: { findForInvoice: vi.fn(), findPdfForInvoice: vi.fn() },
}));

import { invoiceDocumentService } from "../../src/modules/invoices/services/invoice-document.service.js";
import { invoiceDocumentRouter } from "../../src/modules/invoices/routes/invoice-document.routes.js";

function app() {
  const server = express();
  server.use("/invoices", invoiceDocumentRouter);
  server.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({ error: { code: "INTERNAL_ERROR" } });
  });
  return server;
}

async function request(server: ReturnType<typeof express>, path: string) {
  const listener = await new Promise<ReturnType<typeof import("node:http").createServer>>((resolve) => {
    const httpServer = server.listen(0, "127.0.0.1", () => resolve(httpServer));
  });
  const address = listener.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind a TCP port");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`);
    return {
      status: response.status,
      body: await response.text(),
      contentType: response.headers.get("content-type"),
      etag: response.headers.get("etag"),
      cacheControl: response.headers.get("cache-control"),
    };
  } finally {
    await new Promise<void>((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  }
}

describe("immutable invoice document route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the stored HTML artifact with its immutable content hash", async () => {
    vi.mocked(invoiceDocumentService.findForInvoice).mockResolvedValue({
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      invoiceId: INVOICE_ID,
      invoiceCode: "INV-2026-000001",
      documentVersion: 1,
      contentType: "text/html; charset=utf-8",
      contentSha256: "a".repeat(64),
      htmlContent: "<!doctype html><html><body>INV-2026-000001</body></html>",
      createdAt: "2026-10-16T21:00:00.000000Z",
    });
    const response = await request(app(), `/invoices/${INVOICE_ID}/document`);
    expect(response.status).toBe(200);
    expect(response.body).toContain("INV-2026-000001");
    expect(response.contentType).toContain("text/html");
    expect(response.etag).toBe(`"sha256-${"a".repeat(64)}"`);
    expect(response.cacheControl).toBe("private, no-store");
    expect(invoiceDocumentService.findForInvoice).toHaveBeenCalledWith(CONTEXT, INVOICE_ID);
  });

  it("returns the immutable PDF as a private attachment with a hash ETag", async () => {
    const pdfContent = Buffer.from("%PDF-1.4\\n%%EOF\\n", "ascii");
    vi.mocked(invoiceDocumentService.findPdfForInvoice).mockResolvedValue({
      id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      invoiceId: INVOICE_ID,
      invoiceCode: "INV-2026-000001",
      documentVersion: 1,
      contentType: "application/pdf",
      contentSha256: "b".repeat(64),
      pdfContent,
      createdAt: "2026-10-16T21:00:00.000000Z",
    });
    const response = await request(app(), `/invoices/${INVOICE_ID}/document.pdf`);
    expect(response.status).toBe(200);
    expect(response.body).toBe(pdfContent.toString("ascii"));
    expect(response.contentType).toContain("application/pdf");
    expect(response.etag).toBe(`"sha256-${"b".repeat(64)}"`);
    expect(response.cacheControl).toBe("private, no-store");
    expect(invoiceDocumentService.findPdfForInvoice).toHaveBeenCalledWith(CONTEXT, INVOICE_ID);
  });

  it("rejects malformed IDs and does not expose an artifact for an unknown invoice", async () => {
    const invalid = await request(app(), "/invoices/not-a-uuid/document");
    expect(invalid.status).toBe(400);
    expect(invoiceDocumentService.findForInvoice).not.toHaveBeenCalled();

    vi.mocked(invoiceDocumentService.findForInvoice).mockResolvedValue(null);
    const missing = await request(app(), `/invoices/${INVOICE_ID}/document`);
    expect(missing.status).toBe(404);
  });
});
