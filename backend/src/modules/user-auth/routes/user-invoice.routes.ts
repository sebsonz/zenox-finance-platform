import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { requireUserAuth } from "../../../middleware/require-user-auth.js";
import { withTenantTransaction } from "../../../db/transaction.js";
import { invoiceRepository } from "../../invoices/repositories/invoice.repository.js";
import {
  createInvoiceDraftSchema,
  listInvoiceDraftsQuerySchema,
  updateInvoiceDraftSchema,
} from "../../invoices/validators/invoice-draft.schema.js";
import { invoiceDraftService, InvoiceDraftServiceError } from "../../invoices/services/invoice-draft.service.js";
import type { FinanceUserInvoiceContext } from "../../invoices/types/invoice-operation-context.js";
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
  permission: "invoices:create",
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
    res.status(403).json({ error: { code: "INVOICE_WRITE_DENIED", message: "The user is not authorized to create or edit invoices." } });
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
