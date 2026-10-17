import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { requireUserAuth } from "../../../middleware/require-user-auth.js";
import { withTenantTransaction } from "../../../db/transaction.js";
import { invoiceRepository } from "../../invoices/repositories/invoice.repository.js";
import { listInvoiceDraftsQuerySchema } from "../../invoices/validators/invoice-draft.schema.js";
import { userTenantMembershipRepository } from "../../tenants/repositories/user-tenant-membership.repository.js";
import { assertActiveMembershipCan } from "../../tenants/services/user-tenant-permissions.service.js";
import { tenantRepository } from "../../tenants/repositories/tenant.repository.js";

export const userInvoiceRouter = Router();

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
          page: { limit: parsedQuery.data.limit, count: invoices.length },
          correlationId: String(res.locals["correlationId"] ?? ""),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);
