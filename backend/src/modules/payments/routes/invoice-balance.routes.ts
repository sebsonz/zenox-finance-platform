import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { requireIntegrationAuth } from "../../../middleware/require-integration-auth.js";
import { PaymentServiceError, paymentService } from "../services/payment.service.js";

export const invoiceBalanceRouter = Router();

invoiceBalanceRouter.get(
  "/:invoiceId/balance",
  requireIntegrationAuth(["invoice:read"]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const context = req.financeContext;
    if (!context) { res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "A verified Finance context is required." } }); return; }
    const id = z.string().uuid().safeParse(req.params["invoiceId"]);
    if (!id.success) { res.status(400).json({ error: { code: "INVALID_INVOICE_ID", message: "The invoice ID must be a UUID." } }); return; }
    try {
      const balance = await paymentService.invoiceBalance(context, id.data);
      res.status(200).json({ data: { balance, correlationId: context.correlationId } });
    } catch (error) {
      if (error instanceof PaymentServiceError && error.code === "INVOICE_NOT_FOUND") {
        res.status(404).json({ error: { code: error.code, message: error.message, correlationId: context.correlationId } });
        return;
      }
      next(error);
    }
  },
);
