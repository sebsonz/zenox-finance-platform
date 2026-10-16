import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { requireIntegrationAuth } from "../../../middleware/require-integration-auth.js";
import { InvoiceDraftServiceError, invoiceDraftService } from "../services/invoice-draft.service.js";
import { createInvoiceDraftSchema, listInvoiceDraftsQuerySchema } from "../validators/invoice-draft.schema.js";

export const invoiceDraftRouter = Router();

invoiceDraftRouter.post(
  "/drafts",
  requireIntegrationAuth(["invoice:draft:write"]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const context = req.financeContext;
    if (!context) {
      res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "A verified Finance context is required." } });
      return;
    }
    const parsed = createInvoiceDraftSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: "INVALID_REQUEST", message: "The invoice draft request is invalid.",
        issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code, message: issue.message })) } });
      return;
    }
    try {
      const invoice = await invoiceDraftService.create(context, parsed.data);
      res.status(201).json({ data: { invoice, correlationId: context.correlationId } });
    } catch (error) {
      if (error instanceof InvoiceDraftServiceError) {
        const status = error.code === "CUSTOMER_NOT_FOUND" ? 404 : 422;
        res.status(status).json({ error: { code: error.code, message: error.message, correlationId: context.correlationId } });
        return;
      }
      if (error instanceof Error && /^(INVALID_|EXCESSIVE_|QUANTITY_|UNIT_PRICE_|DISCOUNT_|TAX_RATE_|INVOICE_REQUIRES_|TOO_MANY_)/.test(error.message)) {
        res.status(422).json({ error: { code: error.message, message: "The invoice lines cannot be calculated.", correlationId: context.correlationId } });
        return;
      }
      next(error);
    }
  },
);

invoiceDraftRouter.get(
  "/drafts",
  requireIntegrationAuth(["invoice:read"]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const context = req.financeContext;
    if (!context) {
      res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "A verified Finance context is required." } });
      return;
    }
    const parsed = listInvoiceDraftsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: { code: "INVALID_QUERY", message: "The invoice list query is invalid." } });
      return;
    }
    try {
      const invoices = await invoiceDraftService.list(context, parsed.data);
      res.status(200).json({ data: { invoices, correlationId: context.correlationId } });
    } catch (error) { next(error); }
  },
);

invoiceDraftRouter.get(
  "/drafts/:invoiceId",
  requireIntegrationAuth(["invoice:read"]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const context = req.financeContext;
    if (!context) {
      res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "A verified Finance context is required." } });
      return;
    }
    const parsedId = z.string().uuid().safeParse(req.params["invoiceId"]);
    if (!parsedId.success) {
      res.status(400).json({ error: { code: "INVALID_INVOICE_ID", message: "The invoice ID must be a UUID." } });
      return;
    }
    try {
      const invoice = await invoiceDraftService.findById(context, parsedId.data);
      if (!invoice) {
        res.status(404).json({ error: { code: "INVOICE_NOT_FOUND", message: "The invoice was not found.", correlationId: context.correlationId } });
        return;
      }
      res.status(200).json({ data: { invoice, correlationId: context.correlationId } });
    } catch (error) { next(error); }
  },
);
