import express from "express";
import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const TENANT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PRINCIPAL_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const INVOICE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SNAPSHOT_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const CONTEXT = {
  tenantId: TENANT_ID,
  principal: {
    id: PRINCIPAL_ID,
    principalCode: "ci-integration",
    displayName: "CI Integration",
    scopes: ["invoice:draft:write", "tax:calculate"],
    allowedTenantIds: [TENANT_ID],
  },
  correlationId: "test-tax-correlation",
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

vi.mock("../../src/modules/invoices/services/invoice-tax-snapshot.service.js", () => ({
  InvoiceTaxSnapshotServiceError: class InvoiceTaxSnapshotServiceError extends Error {
    constructor(readonly code: string, message: string) { super(message); }
  },
  invoiceTaxSnapshotService: { calculateAndAttach: vi.fn() },
}));

import {
  InvoiceTaxSnapshotServiceError,
  invoiceTaxSnapshotService,
} from "../../src/modules/invoices/services/invoice-tax-snapshot.service.js";
import { invoiceTaxSnapshotRouter } from "../../src/modules/invoices/routes/invoice-tax-snapshot.routes.js";

function app() {
  const server = express();
  server.use(express.json());
  server.use("/invoices", invoiceTaxSnapshotRouter);
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

const validBody = {
  expectedUpdatedAt: "2026-10-16T21:00:00.000Z",
  taxDate: "2026-10-16",
  jurisdictionId: TENANT_ID,
  appliesTo: "FREIGHT",
};

describe("invoice tax snapshot route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("validates the invoice ID and calculation request", async () => {
    const invalidId = await request(app(), "/invoices/drafts/not-a-uuid/tax-snapshot", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(validBody),
    });
    expect(invalidId.status).toBe(400);
    expect(invalidId.body).toMatchObject({ error: { code: "INVALID_INVOICE_ID" } });

    const invalidBody = await request(app(), `/invoices/drafts/${INVOICE_ID}/tax-snapshot`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...validBody, unknown: true }),
    });
    expect(invalidBody.status).toBe(400);
    expect(invalidBody.body).toMatchObject({ error: { code: "INVALID_REQUEST" } });
    expect(invoiceTaxSnapshotService.calculateAndAttach).not.toHaveBeenCalled();
  });

  it("calculates and attaches immutable evidence to the current draft revision", async () => {
    vi.mocked(invoiceTaxSnapshotService.calculateAndAttach).mockResolvedValue({
      snapshot: {
        id: SNAPSHOT_ID, tenantId: TENANT_ID, documentType: "INVOICE", documentId: INVOICE_ID,
        documentVersion: 2, calculationPolicy: "INVOICE_TAX_SNAPSHOT_PER_LINE_V1",
        engineVersion: "zenox-finance-tax-engine/1.0.0", taxDate: "2026-10-16",
        currencyCode: "XOF", currencyMinorUnit: 0, jurisdictionId: TENANT_ID,
        inputSnapshot: {}, resultSnapshot: { taxTotal: "180" }, appliedRulesSnapshot: [],
        createdAt: "2026-10-16T21:00:00Z", createdBy: PRINCIPAL_ID,
      },
      invoice: { id: INVOICE_ID, taxSnapshotId: SNAPSHOT_ID, taxSnapshotVersion: 2, taxStatus: "CALCULATED" },
    } as never);

    const response = await request(app(), `/invoices/drafts/${INVOICE_ID}/tax-snapshot`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(validBody),
    });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      data: {
        snapshot: { id: SNAPSHOT_ID, documentVersion: 2 },
        invoice: { taxSnapshotId: SNAPSHOT_ID, taxStatus: "CALCULATED" },
        correlationId: "test-tax-correlation",
      },
    });
    expect(invoiceTaxSnapshotService.calculateAndAttach).toHaveBeenCalledWith(CONTEXT, INVOICE_ID, expect.objectContaining({
      expectedUpdatedAt: validBody.expectedUpdatedAt,
      appliesTo: "FREIGHT",
    }));
  });

  it("maps a stale draft revision to 409 Conflict", async () => {
    vi.mocked(invoiceTaxSnapshotService.calculateAndAttach).mockRejectedValue(
      new InvoiceTaxSnapshotServiceError("INVOICE_NOT_FOUND_OR_CHANGED", "Reload the draft."),
    );
    const response = await request(app(), `/invoices/drafts/${INVOICE_ID}/tax-snapshot`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(validBody),
    });
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ error: { code: "INVOICE_NOT_FOUND_OR_CHANGED" } });
  });
});
