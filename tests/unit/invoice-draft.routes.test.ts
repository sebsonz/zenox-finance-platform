import express from "express";
import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const TENANT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PRINCIPAL_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CUSTOMER_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
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
  invoiceDraftService: { create: vi.fn(), findById: vi.fn(), list: vi.fn() },
}));

import { invoiceDraftService } from "../../src/modules/invoices/services/invoice-draft.service.js";
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
  lines: [{ description: "Transport", quantity: "2", unitPrice: "15000", taxRatePercent: "18" }],
};

describe("invoice draft API routes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects client-supplied totals before calling the service", async () => {
    const response = await request(app(), "/invoices/drafts", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...validBody, grandTotal: "1" }),
    });
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: { code: "INVALID_REQUEST" } });
    expect(invoiceDraftService.create).not.toHaveBeenCalled();
  });

  it("creates a draft and returns 201 with the correlation ID", async () => {
    vi.mocked(invoiceDraftService.create).mockResolvedValue({ id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", status: "DRAFT" } as never);
    const response = await request(app(), "/invoices/drafts", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(validBody),
    });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ data: { invoice: { status: "DRAFT" }, correlationId: "test-correlation" } });
    expect(invoiceDraftService.create).toHaveBeenCalledWith(CONTEXT, expect.objectContaining({ currencyCode: "XOF" }));
  });

  it("validates invoice identifiers before querying the service", async () => {
    const response = await request(app(), "/invoices/drafts/not-a-uuid");
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: { code: "INVALID_INVOICE_ID" } });
    expect(invoiceDraftService.findById).not.toHaveBeenCalled();
  });

  it("returns tenant-scoped invoice detail when found", async () => {
    vi.mocked(invoiceDraftService.findById).mockResolvedValue({ id: CUSTOMER_ID, status: "DRAFT" } as never);
    const response = await request(app(), `/invoices/drafts/${CUSTOMER_ID}`);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ data: { invoice: { id: CUSTOMER_ID }, correlationId: "test-correlation" } });
    expect(invoiceDraftService.findById).toHaveBeenCalledWith(CONTEXT, CUSTOMER_ID);
  });
});
