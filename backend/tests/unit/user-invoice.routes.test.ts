import express from "express";
import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const TENANT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER_ISSUER = "https://qsmairsmgfnlmiltvgvn.supabase.co";
const INVOICE_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const CUSTOMER_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

vi.mock("../../src/middleware/require-user-auth.js", () => ({
  requireUserAuth: () => (req: Request, _res: Response, next: NextFunction) => {
    req.financeUser = { id: USER_ID, issuer: USER_ISSUER, email: "user@example.test" };
    next();
  },
}));
vi.mock("../../src/modules/tenants/repositories/user-tenant-membership.repository.js", () => ({
  userTenantMembershipRepository: { findActiveMembership: vi.fn() },
}));
vi.mock("../../src/modules/tenants/services/user-tenant-permissions.service.js", () => ({
  assertActiveMembershipCan: vi.fn((membership: { status: string; role_code: string }, permission: string) => {
    if (membership.status !== "ACTIVE" || membership.role_code === "NO_INVOICE_ACCESS" || (permission !== "invoices:read" && !["OWNER", "ADMIN", "FINANCE_MANAGER"].includes(membership.role_code))) {
      throw new Error("User is not authorized");
    }
  }),
}));
vi.mock("../../src/modules/tenants/repositories/tenant.repository.js", () => ({
  tenantRepository: { findActiveById: vi.fn() },
}));
vi.mock("../../src/db/transaction.js", () => ({
  withTenantTransaction: vi.fn(async (_tenantId: string, work: (client: never) => Promise<unknown>) => work({} as never)),
}));
vi.mock("../../src/modules/invoices/repositories/invoice.repository.js", () => ({
  invoiceRepository: { list: vi.fn() },
}));

vi.mock("../../src/modules/invoices/services/invoice-tax-snapshot.service.js", () => ({
  InvoiceTaxSnapshotServiceError: class InvoiceTaxSnapshotServiceError extends Error {
    constructor(readonly code: string, message: string) { super(message); }
  },
  invoiceTaxSnapshotService: { calculateAndAttach: vi.fn() },
}));
vi.mock("../../src/modules/invoices/services/invoice-issuance.service.js", () => ({
  InvoiceIssuanceServiceError: class InvoiceIssuanceServiceError extends Error {
    constructor(readonly code: string, message: string) { super(message); }
  },
  invoiceIssuanceService: { issue: vi.fn() },
}));
vi.mock("../../src/modules/invoices/services/credit-note.service.js", () => ({
  CreditNoteServiceError: class CreditNoteServiceError extends Error {
    constructor(readonly code: string, message: string) { super(message); }
  },
  creditNoteService: { issueFullReversal: vi.fn(), listForInvoice: vi.fn(), findDocument: vi.fn(), findPdf: vi.fn() },
}));
vi.mock("../../src/modules/invoices/services/invoice-document.service.js", () => ({
  invoiceDocumentService: { findForInvoice: vi.fn(), findPdfForInvoice: vi.fn() },
}));
vi.mock("../../src/modules/customers/repositories/customer.repository.js", () => ({
  customerRepository: { list: vi.fn() },
}));

vi.mock("../../src/modules/invoices/services/invoice-draft.service.js", () => ({
  InvoiceDraftServiceError: class InvoiceDraftServiceError extends Error {
    constructor(readonly code: string, message: string) { super(message); }
  },
  invoiceDraftService: { create: vi.fn(), updateDraft: vi.fn(), findById: vi.fn(), list: vi.fn() },
}));


import { userTenantMembershipRepository } from "../../src/modules/tenants/repositories/user-tenant-membership.repository.js";
import { tenantRepository } from "../../src/modules/tenants/repositories/tenant.repository.js";
import { assertActiveMembershipCan } from "../../src/modules/tenants/services/user-tenant-permissions.service.js";
import { withTenantTransaction } from "../../src/db/transaction.js";
import { invoiceRepository } from "../../src/modules/invoices/repositories/invoice.repository.js";
import { invoiceDraftService } from "../../src/modules/invoices/services/invoice-draft.service.js";
import { invoiceTaxSnapshotService } from "../../src/modules/invoices/services/invoice-tax-snapshot.service.js";
import { invoiceIssuanceService } from "../../src/modules/invoices/services/invoice-issuance.service.js";
import { creditNoteService } from "../../src/modules/invoices/services/credit-note.service.js";
import { invoiceDocumentService } from "../../src/modules/invoices/services/invoice-document.service.js";
import { userInvoiceRouter } from "../../src/modules/user-auth/routes/user-invoice.routes.js";

function app() {
  const server = express();
  server.use(express.json());
  server.use("/user/tenants", userInvoiceRouter);
  server.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({ error: { code: "INTERNAL_ERROR" } });
  });
  return server;
}

async function getWithExpress(server: ReturnType<typeof express>, path: string, init?: RequestInit) {
  const listener = await new Promise<ReturnType<typeof import("node:http").createServer>>((resolve) => {
    const httpServer = server.listen(0, "127.0.0.1", () => resolve(httpServer));
  });
  const address = listener.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind a TCP port");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, init);
    return { status: response.status, headers: response.headers, body: await response.json() as unknown };
  } finally {
    await new Promise<void>((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  }
}


async function getRawWithExpress(server: ReturnType<typeof express>, path: string) {
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
      cacheControl: response.headers.get("cache-control"),
      etag: response.headers.get("etag"),
    };
  } finally {
    await new Promise<void>((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  }
}

function activeMembership(role_code = "VIEWER") {
  return {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    tenant_id: TENANT_ID,
    identity_issuer: USER_ISSUER,
    identity_subject: USER_ID,
    role_code,
    status: "ACTIVE" as const,
    activated_at: new Date("2026-10-16T00:00:00.000Z"),
  };
}

describe("GET /user/tenants/:tenantId/invoices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(userTenantMembershipRepository.findActiveMembership).mockResolvedValue(activeMembership() as never);
    vi.mocked(tenantRepository.findActiveById).mockResolvedValue({
      id: TENANT_ID, tenant_code: "ZNX-000001", legal_name: "ZENOX Demo Company", status: "ACTIVE",
    });
    vi.mocked(invoiceRepository.list).mockResolvedValue([{ id: INVOICE_ID, status: "DRAFT" }] as never);
  });

  it("rejects malformed tenant identifiers before querying membership", async () => {
    const response = await getWithExpress(app(), "/user/tenants/not-a-uuid/invoices");
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: { code: "INVALID_TENANT_ID" } });
    expect(userTenantMembershipRepository.findActiveMembership).not.toHaveBeenCalled();
  });

  it("rejects invalid list filters", async () => {
    const response = await getWithExpress(app(), `/user/tenants/${TENANT_ID}/invoices?limit=1000`);
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: { code: "INVALID_QUERY" } });
    expect(userTenantMembershipRepository.findActiveMembership).not.toHaveBeenCalled();
  });

  it("denies users without active tenant membership", async () => {
    vi.mocked(userTenantMembershipRepository.findActiveMembership).mockResolvedValue(null);
    const response = await getWithExpress(app(), `/user/tenants/${TENANT_ID}/invoices`);
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ error: { code: "TENANT_ACCESS_DENIED" } });
    expect(tenantRepository.findActiveById).not.toHaveBeenCalled();
    expect(invoiceRepository.list).not.toHaveBeenCalled();
  });

  it("checks the invoice read permission before reading invoice data", async () => {
    vi.mocked(userTenantMembershipRepository.findActiveMembership).mockResolvedValue(activeMembership("NO_INVOICE_ACCESS") as never);
    const response = await getWithExpress(app(), `/user/tenants/${TENANT_ID}/invoices`);
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ error: { code: "INVOICE_ACCESS_DENIED" } });
    expect(assertActiveMembershipCan).toHaveBeenCalledWith(expect.objectContaining({ role_code: "NO_INVOICE_ACCESS" }), "invoices:read");
    expect(invoiceRepository.list).not.toHaveBeenCalled();
  });

  it("does not read invoices for an inactive tenant", async () => {
    vi.mocked(tenantRepository.findActiveById).mockResolvedValue(null);
    const response = await getWithExpress(app(), `/user/tenants/${TENANT_ID}/invoices`);
    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ error: { code: "TENANT_NOT_AVAILABLE" } });
    expect(invoiceRepository.list).not.toHaveBeenCalled();
  });

  it("returns a bounded tenant-scoped invoice list for an authorized user", async () => {
    const response = await getWithExpress(app(), `/user/tenants/${TENANT_ID}/invoices?status=DRAFT&limit=10`);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.body).toMatchObject({
      data: {
        invoices: [{ id: INVOICE_ID, status: "DRAFT" }],
        page: { limit: 10, count: 1 },
      },
    });
    expect(userTenantMembershipRepository.findActiveMembership).toHaveBeenCalledWith(TENANT_ID, USER_ISSUER, USER_ID);
    expect(withTenantTransaction).toHaveBeenCalledWith(TENANT_ID, expect.any(Function));
    expect(invoiceRepository.list).toHaveBeenCalledWith(expect.anything(), TENANT_ID, expect.objectContaining({ status: "DRAFT", limit: 10 }));
  });

  it("forwards unexpected repository failures to the safe error handler", async () => {
    vi.mocked(invoiceRepository.list).mockRejectedValue(new Error("database unavailable"));
    const response = await getWithExpress(app(), `/user/tenants/${TENANT_ID}/invoices`);
    expect(response.status).toBe(500);
    expect(response.body).toMatchObject({ error: { code: "INTERNAL_ERROR" } });
  });

  it("creates a draft only after tenant membership and invoices:create permission checks", async () => {
    vi.mocked(userTenantMembershipRepository.findActiveMembership).mockResolvedValue(activeMembership("OWNER") as never);
    vi.mocked(invoiceDraftService.create).mockResolvedValue({
      id: INVOICE_ID, status: "DRAFT", currencyCode: "XOF", lines: [], grandTotal: "1000",
    } as never);
    const response = await getWithExpress(app(), `/user/tenants/${TENANT_ID}/invoices/drafts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        customerId: CUSTOMER_ID,
        currencyCode: "XOF",
        lines: [{ description: "Freight", quantity: "1", unitPrice: "1000", discountPercent: "0", taxRatePercent: "0" }],
      }),
    });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ data: { invoice: { id: INVOICE_ID, status: "DRAFT" } } });
    expect(assertActiveMembershipCan).toHaveBeenCalledWith(expect.objectContaining({ role_code: "OWNER" }), "invoices:create");
    expect(invoiceDraftService.create).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: TENANT_ID,
      actor: expect.objectContaining({ type: "USER", ref: `${USER_ISSUER}|${USER_ID}` }),
    }), expect.objectContaining({ customerId: CUSTOMER_ID, currencyCode: "XOF" }));
  });

  it("does not call draft creation for a viewer lacking invoices:create", async () => {
    vi.mocked(userTenantMembershipRepository.findActiveMembership).mockResolvedValue(activeMembership("VIEWER") as never);
    const response = await getWithExpress(app(), `/user/tenants/${TENANT_ID}/invoices/drafts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        customerId: CUSTOMER_ID,
        currencyCode: "XOF",
        lines: [{ description: "Freight", quantity: "1", unitPrice: "1000", discountPercent: "0", taxRatePercent: "0" }],
      }),
    });
    expect(response.status).toBe(403);
    expect(invoiceDraftService.create).not.toHaveBeenCalled();
  });

  it("requires tax:manage and passes a verified user context to tax snapshot calculation", async () => {
    vi.mocked(userTenantMembershipRepository.findActiveMembership).mockResolvedValue(activeMembership("OWNER") as never);
    vi.mocked(invoiceTaxSnapshotService.calculateAndAttach).mockResolvedValue({
      snapshot: { id: "ffffffff-ffff-4fff-8fff-ffffffffffff" },
      invoice: { id: INVOICE_ID, taxStatus: "CALCULATED" },
    } as never);
    const response = await getWithExpress(app(), `/user/tenants/${TENANT_ID}/invoices/${INVOICE_ID}/tax-snapshot`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        expectedUpdatedAt: "2026-10-16T21:00:00.000Z",
        taxDate: "2026-10-16", jurisdictionId: TENANT_ID, appliesTo: "FREIGHT",
      }),
    });
    expect(response.status).toBe(201);
    expect(assertActiveMembershipCan).toHaveBeenCalledWith(expect.objectContaining({ role_code: "OWNER" }), "tax:manage");
    expect(invoiceTaxSnapshotService.calculateAndAttach).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: TENANT_ID, actor: expect.objectContaining({ type: "USER" }),
    }), INVOICE_ID, expect.objectContaining({ appliesTo: "FREIGHT" }));
  });

  it("requires invoices:issue and an idempotency key before issuing", async () => {
    vi.mocked(userTenantMembershipRepository.findActiveMembership).mockResolvedValue(activeMembership("OWNER") as never);
    vi.mocked(invoiceIssuanceService.issue).mockResolvedValue({ id: INVOICE_ID, status: "ISSUED" } as never);
    const response = await getWithExpress(app(), `/user/tenants/${TENANT_ID}/invoices/${INVOICE_ID}/issue`, {
      method: "POST",
      headers: { "content-type": "application/json", "Idempotency-Key": "invoice-issue-key-001" },
      body: JSON.stringify({ expectedUpdatedAt: "2026-10-16T21:00:00.000Z" }),
    });
    expect(response.status).toBe(200);
    expect(assertActiveMembershipCan).toHaveBeenCalledWith(expect.objectContaining({ role_code: "OWNER" }), "invoices:issue");
    expect(invoiceIssuanceService.issue).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: TENANT_ID, actor: expect.objectContaining({ type: "USER" }),
    }), INVOICE_ID, "2026-10-16T21:00:00.000Z", "invoice-issue-key-001");
  });

  it("requires invoices:credit before creating a full-reversal credit note", async () => {
    vi.mocked(userTenantMembershipRepository.findActiveMembership).mockResolvedValue(activeMembership("OWNER") as never);
    vi.mocked(creditNoteService.issueFullReversal).mockResolvedValue({
      id: "ffffffff-ffff-4fff-8fff-ffffffffffff", creditNoteCode: "CN-2026-000001", status: "ISSUED",
    } as never);
    const response = await getWithExpress(app(), `/user/tenants/${TENANT_ID}/invoices/${INVOICE_ID}/credit-notes`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "Annulation commerciale complète" }),
    });
    expect(response.status).toBe(201);
    expect(assertActiveMembershipCan).toHaveBeenCalledWith(expect.objectContaining({ role_code: "OWNER" }), "invoices:credit");
    expect(creditNoteService.issueFullReversal).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: TENANT_ID, actor: expect.objectContaining({ type: "USER" }),
    }), INVOICE_ID, "Annulation commerciale complète");
  });

  it("allows an authorized viewer to retrieve the immutable HTML invoice document privately", async () => {
    vi.mocked(userTenantMembershipRepository.findActiveMembership).mockResolvedValue(activeMembership("VIEWER") as never);
    vi.mocked(invoiceDocumentService.findForInvoice).mockResolvedValue({
      id: "ffffffff-ffff-4fff-8fff-ffffffffffff", invoiceId: INVOICE_ID,
      invoiceCode: "INV-2026-000001", documentVersion: 1,
      contentType: "text/html; charset=utf-8", contentSha256: "a".repeat(64),
      htmlContent: "<!doctype html><html><body>INV-2026-000001</body></html>",
      createdAt: "2026-10-16T21:00:00.000000Z",
    });
    const response = await getRawWithExpress(app(), `/user/tenants/${TENANT_ID}/invoices/${INVOICE_ID}/document`);
    expect(response.status).toBe(200);
    expect(response.body).toContain("INV-2026-000001");
    expect(response.contentType).toContain("text/html");
    expect(response.cacheControl).toBe("private, no-store");
    expect(response.etag).toBe(`"sha256-${"a".repeat(64)}"`);
    expect(invoiceDocumentService.findForInvoice).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: TENANT_ID, actor: expect.objectContaining({ type: "USER", ref: `${USER_ISSUER}|${USER_ID}` }),
    }), INVOICE_ID);
  });

  it("denies document retrieval when the user has no membership in the requested tenant", async () => {
    vi.mocked(userTenantMembershipRepository.findActiveMembership).mockResolvedValue(null);
    const response = await getRawWithExpress(app(), `/user/tenants/${TENANT_ID}/invoices/${INVOICE_ID}/document.pdf`);
    expect(response.status).toBe(403);
    expect(invoiceDocumentService.findPdfForInvoice).not.toHaveBeenCalled();
  });
});
