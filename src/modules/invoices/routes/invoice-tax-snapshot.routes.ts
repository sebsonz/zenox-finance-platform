import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { requireIntegrationAuth } from "../../../middleware/require-integration-auth.js";
import { InvoiceTaxSnapshotServiceError, invoiceTaxSnapshotService } from "../services/invoice-tax-snapshot.service.js";
import { calculateInvoiceTaxSnapshotSchema } from "../validators/invoice-tax-calculation.schema.js";

export const invoiceTaxSnapshotRouter = Router();

invoiceTaxSnapshotRouter.post(
  "/drafts/:invoiceId/tax-snapshot",
  requireIntegrationAuth(["invoice:draft:write", "tax:calculate"]),
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
    const parsed = calculateInvoiceTaxSnapshotSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: "INVALID_REQUEST", message: "The tax snapshot request is invalid.",
          issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code, message: issue.message })) },
      });
      return;
    }
    try {
      const result = await invoiceTaxSnapshotService.calculateAndAttach(context, parsedId.data, parsed.data);
      res.status(201).json({ data: { ...result, correlationId: context.correlationId } });
    } catch (error) {
      if (error instanceof InvoiceTaxSnapshotServiceError) {
        const status = error.code === "INVOICE_NOT_FOUND_OR_CHANGED" ? 409 :
          error.code === "CURRENCY_NOT_SUPPORTED" ? 422 : 422;
        res.status(status).json({ error: { code: error.code, message: error.message, correlationId: context.correlationId } });
        return;
      }
      if (error instanceof Error && /^(INVALID_|EXCESSIVE_|TAX_RATE_|TOO_MANY_|INVOICE_REQUIRES_)/.test(error.message)) {
        res.status(422).json({ error: { code: error.message, message: "The tax snapshot could not be calculated.", correlationId: context.correlationId } });
        return;
      }
      if (typeof error === "object" && error !== null && "code" in error && String((error as {code:unknown}).code) === "23505") {
        res.status(409).json({ error: { code: "TAX_SNAPSHOT_ALREADY_EXISTS", message: "A snapshot already exists for this invoice revision.", correlationId: context.correlationId } });
        return;
      }
      next(error);
    }
  },
);
