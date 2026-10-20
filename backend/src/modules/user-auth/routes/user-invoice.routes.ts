import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { requireUserAuth } from "../../../middleware/require-user-auth.js";
import { withTenantTransaction } from "../../../db/transaction.js";
import { invoiceRepository } from "../../invoices/repositories/invoice.repository.js";
import { customerRepository } from "../../customers/repositories/customer.repository.js";
import { currencyRepository } from "../../currencies/repositories/currency.repository.js";
import { listCustomersQuerySchema } from "../../customers/validators/customer.schema.js";
import {
  createInvoiceDraftSchema,
  listInvoiceDraftsQuerySchema,
  updateInvoiceDraftSchema,
} from "../../invoices/validators/invoice-draft.schema.js";
import { invoiceDraftService, InvoiceDraftServiceError } from "../../invoices/services/invoice-draft.service.js";
import type { FinanceUserInvoiceContext } from "../../invoices/types/invoice-operation-context.js";
import type { FinanceUserPermission } from "../../tenants/services/user-tenant-permissions.service.js";
import { calculateInvoiceTaxSnapshotSchema } from "../../invoices/validators/invoice-tax-calculation.schema.js";
import { invoiceTaxSnapshotService, InvoiceTaxSnapshotServiceError } from "../../invoices/services/invoice-tax-snapshot.service.js";
import { invoiceIssuanceService, InvoiceIssuanceServiceError } from "../../invoices/services/invoice-issuance.service.js";
import { invoiceDocumentService } from "../../invoices/services/invoice-document.service.js";
import { creditNoteService, CreditNoteServiceError } from "../../invoices/services/credit-note.service.js";
import { userTenantMembershipRepository } from "../../tenants/repositories/user-tenant-membership.repository.js";
import { assertActiveMembershipCan } from "../../tenants/services/user-tenant-permissions.service.js";
import { tenantRepository } from "../../tenants/repositories/tenant.repository.js";

export const userInvoiceRouter = Router();

userInvoiceRouter.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

const tenantIdSchema = z.string().uuid();

userInvoiceRouter.get(
  "/:tenantId/invoices",
  requireUserAuth(),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const parsedTenantId = tenantIdSchema.safeParse(req.params["tenantId"]);
    if (!parsedTenantId.success) {
      res.status(400).json({
        error: { code: "INVALID_TENANT_ID", message: "A valid tenant ID is required." },
      });
      return;
    }

    const user = req.financeUser;
    if (!user) {
      res.status(401).json({
        error: { code: "UNAUTHENTICATED", message: "A valid user access token is required." },
      });
      return;
    }

    const parsedQuery = listInvoiceDraftsQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      res.status(400).json({
        error: { code: "INVALID_QUERY", message: "The invoice list query is invalid." },
      });
      return;
    }

    try {
      const membership = await userTenantMembershipRepository.findActiveMembership(
        parsedTenantId.data,
        user.issuer,
        user.id,
      );

      if (!membership) {
        res.status(403).json({
          error: { code: "TENANT_ACCESS_DENIED", message: "The user is not an active member of this tenant." },
        });
        return;
      }

      try {
        assertActiveMembershipCan(membership, "invoices:read");
      } catch {
        res.status(403).json({
          error: { code: "INVOICE_ACCESS_DENIED", message: "The user is not authorized to view invoices for this tenant." },
        });
        return;
      }

      const tenant = await tenantRepository.findActiveById(parsedTenantId.data);
      if (!tenant) {
        res.status(404).json({
          error: { code: "TENANT_NOT_AVAILABLE", message: "The requested tenant is not available." },
        });
        return;
      }

      const invoices = await withTenantTransaction(parsedTenantId.data, (client) =>
        invoiceRepository.list(client, parsedTenantId.data, parsedQuery.data),
      );

      res.status(200).json({
        data: {
          invoices,
          page: {
            limit: parsedQuery.data.limit,
            count: invoices.length,
            nextCursor: invoices.length === parsedQuery.data.limit ? invoices[invoices.length - 1]?.id ?? null : null,
          },
          correlationId: String(res.locals["correlationId"] ?? ""),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);


async function resolveInvoiceWriteContext(
  tenantId: string,
  req: Request,
  res: Response,
  permission: FinanceUserPermission,
): Promise<FinanceUserInvoiceContext | null> {
  const user = req.financeUser;
  if (!user) {
    res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "A valid user access token is required." } });
    return null;
  }
  const membership = await userTenantMembershipRepository.findActiveMembership(tenantId, user.issuer, user.id);
  if (!membership) {
    res.status(403).json({ error: { code: "TENANT_ACCESS_DENIED", message: "The user is not an active member of this tenant." } });
    return null;
  }
  try {
    assertActiveMembershipCan(membership, permission);
  } catch {
    res.status(403).json({ error: { code: "INVOICE_WRITE_DENIED", message: "The user is not authorized for this invoice operation." } });
    return null;
  }
  const tenant = await tenantRepository.findActiveById(tenantId);
  if (!tenant) {
    res.status(404).json({ error: { code: "TENANT_NOT_AVAILABLE", message: "The requested tenant is not available." } });
    return null;
  }
  return {
    tenantId,
    correlationId: String(res.locals["correlationId"] ?? ""),
    actor: {
      type: "USER",
      ref: `${user.issuer}|${user.id}`,
      membershipId: membership.id,
      identityIssuer: user.issuer,
      identitySubject: user.id,
    },
  };
}

function sendDraftServiceError(error: unknown, res: Response): boolean {
  if (!(error instanceof InvoiceDraftServiceError)) return false;
  const status = error.code === "DRAFT_NOT_FOUND_OR_CHANGED" ? 409
    : error.code === "CUSTOMER_NOT_FOUND" ? 404
    : 400;
  res.status(status).json({ error: { code: error.code, message: error.message } });
  return true;
}

userInvoiceRouter.post(
  "/:tenantId/invoices/drafts",
  requireUserAuth(),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const parsedTenantId = tenantIdSchema.safeParse(req.params["tenantId"]);
    if (!parsedTenantId.success) {
      res.status(400).json({ error: { code: "INVALID_TENANT_ID", message: "A valid tenant ID is required." } });
      return;
    }
    const parsedBody = createInvoiceDraftSchema.safeParse(req.body);
    if (!parsedBody.success) {
      res.status(400).json({ error: { code: "INVALID_INVOICE_DRAFT", message: "The invoice draft payload is invalid." } });
      return;
    }
    try {
      const context = await resolveInvoiceWriteContext(parsedTenantId.data, req, res, "invoices:create");
      if (!context) return;
      const invoice = await invoiceDraftService.create(context, parsedBody.data);
      res.status(201).json({ data: { invoice, correlationId: context.correlationId } });
    } catch (error) {
      if (sendDraftServiceError(error, res)) return;
      next(error);
    }
  },
);

userInvoiceRouter.put(
  "/:tenantId/invoices/drafts/:invoiceId",
  requireUserAuth(),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const parsedTenantId = tenantIdSchema.safeParse(req.params["tenantId"]);
    const parsedInvoiceId = tenantIdSchema.safeParse(req.params["invoiceId"]);
    if (!parsedTenantId.success || !parsedInvoiceId.success) {
      res.status(400).json({ error: { code: "INVALID_RESOURCE_ID", message: "Valid tenant and invoice IDs are required." } });
      return;
    }
    const parsedBody = updateInvoiceDraftSchema.safeParse(req.body);
    if (!parsedBody.success) {
      res.status(400).json({ error: { code: "INVALID_INVOICE_DRAFT", message: "The invoice draft payload is invalid." } });
      return;
    }
    try {
      const context = await resolveInvoiceWriteContext(parsedTenantId.data, req, res, "invoices:create");
      if (!context) return;
      const invoice = await invoiceDraftService.updateDraft(context, parsedInvoiceId.data, parsedBody.data);
      res.status(200).json({ data: { invoice, correlationId: context.correlationId } });
    } catch (error) {
      if (sendDraftServiceError(error, res)) return;
      next(error);
    }
  },
);


userInvoiceRouter.post(
  "/:tenantId/invoices/:invoiceId/tax-snapshot",
  requireUserAuth(),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const tenant = tenantIdSchema.safeParse(req.params["tenantId"]);
    const invoiceId = tenantIdSchema.safeParse(req.params["invoiceId"]);
    if (!tenant.success || !invoiceId.success) {
      res.status(400).json({ error: { code: "INVALID_RESOURCE_ID", message: "Valid tenant and invoice IDs are required." } });
      return;
    }
    const body = calculateInvoiceTaxSnapshotSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: { code: "INVALID_TAX_REQUEST", message: "The tax snapshot request is invalid." } });
      return;
    }
    try {
      const context = await resolveInvoiceWriteContext(tenant.data, req, res, "tax:manage");
      if (!context) return;
      const result = await invoiceTaxSnapshotService.calculateAndAttach(context, invoiceId.data, body.data);
      res.status(201).json({ data: { ...result, correlationId: context.correlationId } });
    } catch (error) {
      if (error instanceof InvoiceTaxSnapshotServiceError) {
        const status = error.code === "INVOICE_NOT_FOUND_OR_CHANGED" ? 409 : 422;
        res.status(status).json({ error: { code: error.code, message: error.message, correlationId: String(res.locals["correlationId"] ?? "") } });
        return;
      }
      next(error);
    }
  },
);

const issueInvoiceSchema = z.object({ expectedUpdatedAt: z.iso.datetime({ offset: true }) }).strict();

userInvoiceRouter.post(
  "/:tenantId/invoices/:invoiceId/issue",
  requireUserAuth(),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const tenant = tenantIdSchema.safeParse(req.params["tenantId"]);
    const invoiceId = tenantIdSchema.safeParse(req.params["invoiceId"]);
    if (!tenant.success || !invoiceId.success) {
      res.status(400).json({ error: { code: "INVALID_RESOURCE_ID", message: "Valid tenant and invoice IDs are required." } });
      return;
    }
    const body = issueInvoiceSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: { code: "INVALID_ISSUE_REQUEST", message: "The invoice issue request is invalid." } });
      return;
    }
    const idempotencyKey = z.string().trim().min(8).max(128).safeParse(req.header("Idempotency-Key"));
    if (!idempotencyKey.success) {
      res.status(400).json({ error: { code: "INVALID_IDEMPOTENCY_KEY", message: "An Idempotency-Key header is required." } });
      return;
    }
    try {
      const context = await resolveInvoiceWriteContext(tenant.data, req, res, "invoices:issue");
      if (!context) return;
      const invoice = await invoiceIssuanceService.issue(context, invoiceId.data, body.data.expectedUpdatedAt, idempotencyKey.data);
      res.status(200).json({ data: { invoice, correlationId: context.correlationId } });
    } catch (error) {
      if (error instanceof InvoiceIssuanceServiceError) {
        const status = error.code === "INVOICE_NOT_FOUND_OR_CHANGED" || error.code === "IDEMPOTENCY_KEY_REUSED" ? 409 : 422;
        res.status(status).json({ error: { code: error.code, message: error.message, correlationId: String(res.locals["correlationId"] ?? "") } });
        return;
      }
      next(error);
    }
  },
);

async function authorizeInvoiceRead(
  tenantId: string,
  req: Request,
  res: Response,
): Promise<FinanceUserInvoiceContext | null> {
  return resolveInvoiceWriteContext(tenantId, req, res, "invoices:read");
}

userInvoiceRouter.get(
  "/:tenantId/invoices/:invoiceId/document",
  requireUserAuth(),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const tenant = tenantIdSchema.safeParse(req.params["tenantId"]);
    const invoiceId = tenantIdSchema.safeParse(req.params["invoiceId"]);
    if (!tenant.success || !invoiceId.success) {
      res.status(400).json({ error: { code: "INVALID_RESOURCE_ID", message: "Valid tenant and invoice IDs are required." } });
      return;
    }
    try {
      const context = await authorizeInvoiceRead(tenant.data, req, res);
      if (!context) return;
      const artifact = await invoiceDocumentService.findForInvoice(context, invoiceId.data);
      if (!artifact) {
        res.status(404).json({ error: { code: "INVOICE_DOCUMENT_NOT_FOUND", message: "No issued HTML document exists for this invoice." } });
        return;
      }
      res.setHeader("Content-Type", artifact.contentType);
      res.setHeader("Content-Disposition", `inline; filename="${artifact.invoiceCode}.html"`);
      res.setHeader("ETag", `"sha256-${artifact.contentSha256}"`);
      res.setHeader("X-Document-SHA256", artifact.contentSha256);
      res.setHeader("Cache-Control", "private, no-store");
      res.status(200).send(artifact.htmlContent);
    } catch (error) { next(error); }
  },
);

userInvoiceRouter.get(
  "/:tenantId/invoices/:invoiceId/document.pdf",
  requireUserAuth(),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const tenant = tenantIdSchema.safeParse(req.params["tenantId"]);
    const invoiceId = tenantIdSchema.safeParse(req.params["invoiceId"]);
    if (!tenant.success || !invoiceId.success) {
      res.status(400).json({ error: { code: "INVALID_RESOURCE_ID", message: "Valid tenant and invoice IDs are required." } });
      return;
    }
    try {
      const context = await authorizeInvoiceRead(tenant.data, req, res);
      if (!context) return;
      const artifact = await invoiceDocumentService.findPdfForInvoice(context, invoiceId.data);
      if (!artifact) {
        res.status(404).json({ error: { code: "INVOICE_PDF_NOT_FOUND", message: "No issued PDF exists for this invoice." } });
        return;
      }
      res.setHeader("Content-Type", artifact.contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${artifact.invoiceCode}.pdf"`);
      res.setHeader("ETag", `"sha256-${artifact.contentSha256}"`);
      res.setHeader("X-Document-SHA256", artifact.contentSha256);
      res.setHeader("Cache-Control", "private, no-store");
      res.status(200).send(artifact.pdfContent);
    } catch (error) { next(error); }
  },
);


const creditNoteRequestSchema = z.object({ reason: z.string().trim().min(3).max(2000) }).strict();

userInvoiceRouter.get(
  "/:tenantId/invoices/:invoiceId/credit-notes",
  requireUserAuth(),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const tenant = tenantIdSchema.safeParse(req.params["tenantId"]);
    const invoiceId = tenantIdSchema.safeParse(req.params["invoiceId"]);
    if (!tenant.success || !invoiceId.success) {
      res.status(400).json({ error: { code: "INVALID_RESOURCE_ID", message: "Valid tenant and invoice IDs are required." } });
      return;
    }
    try {
      const context = await authorizeInvoiceRead(tenant.data, req, res);
      if (!context) return;
      const creditNotes = await creditNoteService.listForInvoice(context, invoiceId.data);
      res.status(200).json({ data: { creditNotes, correlationId: context.correlationId } });
    } catch (error) { next(error); }
  },
);

userInvoiceRouter.post(
  "/:tenantId/invoices/:invoiceId/credit-notes",
  requireUserAuth(),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const tenant = tenantIdSchema.safeParse(req.params["tenantId"]);
    const invoiceId = tenantIdSchema.safeParse(req.params["invoiceId"]);
    const body = creditNoteRequestSchema.safeParse(req.body);
    if (!tenant.success || !invoiceId.success) {
      res.status(400).json({ error: { code: "INVALID_RESOURCE_ID", message: "Valid tenant and invoice IDs are required." } });
      return;
    }
    if (!body.success) {
      res.status(400).json({ error: { code: "INVALID_CREDIT_NOTE_REQUEST", message: "A valid credit note reason is required." } });
      return;
    }
    try {
      const context = await resolveInvoiceWriteContext(tenant.data, req, res, "invoices:credit");
      if (!context) return;
      const creditNote = await creditNoteService.issueFullReversal(context, invoiceId.data, body.data.reason);
      res.status(201).json({ data: { creditNote, correlationId: context.correlationId } });
    } catch (error) {
      if (error instanceof CreditNoteServiceError) {
        const status = error.code === "CREDIT_NOTE_ALREADY_EXISTS" || error.code === "SOURCE_INVOICE_NOT_ISSUED" ? 409 : 422;
        res.status(status).json({ error: { code: error.code, message: error.message, correlationId: String(res.locals["correlationId"] ?? "") } });
        return;
      }
      next(error);
    }
  },
);

userInvoiceRouter.get(
  "/:tenantId/invoices/credit-notes/:creditNoteId/document",
  requireUserAuth(),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const tenant = tenantIdSchema.safeParse(req.params["tenantId"]);
    const id = tenantIdSchema.safeParse(req.params["creditNoteId"]);
    if (!tenant.success || !id.success) {
      res.status(400).json({ error: { code: "INVALID_RESOURCE_ID", message: "Valid tenant and credit note IDs are required." } });
      return;
    }
    try {
      const context = await authorizeInvoiceRead(tenant.data, req, res);
      if (!context) return;
      const artifact = await creditNoteService.findDocument(context, id.data);
      if (!artifact) {
        res.status(404).json({ error: { code: "CREDIT_NOTE_NOT_FOUND", message: "The credit note document was not found." } });
        return;
      }
      res.setHeader("Content-Type", artifact.contentType);
      res.setHeader("Content-Disposition", `inline; filename="${artifact.creditNoteCode}.html"`);
      res.setHeader("ETag", `"sha256-${artifact.sha256}"`);
      res.setHeader("Cache-Control", "private, no-store");
      res.status(200).send(artifact.content);
    } catch (error) { next(error); }
  },
);

userInvoiceRouter.get(
  "/:tenantId/invoices/credit-notes/:creditNoteId/document.pdf",
  requireUserAuth(),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const tenant = tenantIdSchema.safeParse(req.params["tenantId"]);
    const id = tenantIdSchema.safeParse(req.params["creditNoteId"]);
    if (!tenant.success || !id.success) {
      res.status(400).json({ error: { code: "INVALID_RESOURCE_ID", message: "Valid tenant and credit note IDs are required." } });
      return;
    }
    try {
      const context = await authorizeInvoiceRead(tenant.data, req, res);
      if (!context) return;
      const artifact = await creditNoteService.findPdf(context, id.data);
      if (!artifact) {
        res.status(404).json({ error: { code: "CREDIT_NOTE_NOT_FOUND", message: "The credit note PDF was not found." } });
        return;
      }
      res.setHeader("Content-Type", artifact.contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${artifact.creditNoteCode}.pdf"`);
      res.setHeader("ETag", `"sha256-${artifact.sha256}"`);
      res.setHeader("Cache-Control", "private, no-store");
      res.status(200).send(artifact.content);
    } catch (error) { next(error); }
  },
);


userInvoiceRouter.get(
  "/:tenantId/customers",
  requireUserAuth(),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const tenant = tenantIdSchema.safeParse(req.params["tenantId"]);
    if (!tenant.success) {
      res.status(400).json({ error: { code: "INVALID_TENANT_ID", message: "A valid tenant ID is required." } });
      return;
    }
    const query = listCustomersQuerySchema.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: { code: "INVALID_CUSTOMER_QUERY", message: "The customer query is invalid." } });
      return;
    }
    try {
      const context = await resolveInvoiceWriteContext(tenant.data, req, res, "invoices:create");
      if (!context) return;
      const customers = await withTenantTransaction(tenant.data, (client) => customerRepository.list(client, query.data));
      res.status(200).json({ data: { customers, correlationId: context.correlationId } });
    } catch (error) { next(error); }
  },
);


userInvoiceRouter.get(
  "/:tenantId/currencies",
  requireUserAuth(),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const tenant = tenantIdSchema.safeParse(req.params["tenantId"]);
    if (!tenant.success) {
      res.status(400).json({ error: { code: "INVALID_TENANT_ID", message: "A valid tenant ID is required." } });
      return;
    }
    try {
      const context = await resolveInvoiceWriteContext(tenant.data, req, res, "invoices:create");
      if (!context) return;
      const currencies = await currencyRepository.listActive();
      res.status(200).json({ data: { currencies, correlationId: context.correlationId } });
    } catch (error) { next(error); }
  },
);

userInvoiceRouter.get(
  "/:tenantId/tax-jurisdictions",
  requireUserAuth(),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const tenant = tenantIdSchema.safeParse(req.params["tenantId"]);
    if (!tenant.success) {
      res.status(400).json({ error: { code: "INVALID_TENANT_ID", message: "A valid tenant ID is required." } });
      return;
    }
    try {
      const context = await resolveInvoiceWriteContext(tenant.data, req, res, "tax:read");
      if (!context) return;
      const jurisdictions = await withTenantTransaction(tenant.data, async (client) => {
        const result = await client.query<{ id: string; code: string; country_code: string; name: string; jurisdiction_level: string }>(
          `SELECT id, code, country_code, name, jurisdiction_level
             FROM public.finance_tax_jurisdictions
            WHERE is_active = true
            ORDER BY country_code, jurisdiction_level, name
            LIMIT 500`,
        );
        return result.rows.map((row) => ({
          id: row.id, code: row.code, countryCode: row.country_code,
          name: row.name, level: row.jurisdiction_level,
        }));
      });
      res.status(200).json({ data: { jurisdictions, correlationId: context.correlationId } });
    } catch (error) { next(error); }
  },
);
