import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { requireIntegrationAuth } from "../../../middleware/require-integration-auth.js";
import { InvoiceIssuanceServiceError, invoiceIssuanceService } from "../services/invoice-issuance.service.js";

const issueInvoiceSchema = z.object({
  expectedUpdatedAt: z.iso.datetime({ offset: true }),
}).strict();

export const invoiceIssuanceRouter = Router();

invoiceIssuanceRouter.post(
  "/:invoiceId/issue",
  requireIntegrationAuth(["invoice:issue"]),
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
    const parsed = issueInvoiceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: "INVALID_REQUEST", message: "The invoice issue request is invalid." } });
      return;
    }
    try {
      const invoice = await invoiceIssuanceService.issue(context, parsedId.data, parsed.data.expectedUpdatedAt);
      res.status(200).json({ data: { invoice, correlationId: context.correlationId } });
    } catch (error) {
      if (error instanceof InvoiceIssuanceServiceError) {
        const status = error.code === "INVOICE_NOT_FOUND_OR_CHANGED" ? 409 : 422;
        res.status(status).json({ error: { code: error.code, message: error.message, correlationId: context.correlationId } });
        return;
      }
      if (error instanceof Error && error.message === "INVOICE_SEQUENCE_ALLOCATION_FAILED") {
        res.status(500).json({ error: { code: error.message, message: "Invoice numbering failed safely.", correlationId: context.correlationId } });
        return;
      }
      next(error);
    }
  },
);
