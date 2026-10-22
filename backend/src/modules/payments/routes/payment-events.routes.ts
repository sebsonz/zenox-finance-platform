import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { requireIntegrationAuth } from "../../../middleware/require-integration-auth.js";
import { paymentEventsService } from "../services/payment-events.service.js";

export const paymentEventsRouter = Router();

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().uuid().optional(),
}).strict();

function sendError(error: unknown, res: Response, next: NextFunction, correlationId: string): void {
  if (error instanceof Error && error.name === "ZodError") {
    res.status(400).json({ error: { code: "INVALID_EVENT_QUERY", message: "The event query is invalid.", correlationId } });
    return;
  }
  next(error);
}

paymentEventsRouter.get(
  "/:paymentId/events",
  requireIntegrationAuth(["payments:read"]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const context = req.financeContext;
    if (!context) { res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "A verified Finance context is required." } }); return; }
    const paymentId = z.string().uuid().safeParse(req.params["paymentId"]);
    const query = querySchema.safeParse(req.query);
    if (!paymentId.success) { res.status(400).json({ error: { code: "INVALID_PAYMENT_ID", message: "The payment ID must be a UUID." } }); return; }
    if (!query.success) { res.status(400).json({ error: { code: "INVALID_EVENT_QUERY", message: "The event query is invalid." } }); return; }
    try {
      const result = await paymentEventsService.listPaymentEvents(context, paymentId.data, query.data.limit, query.data.cursor);
      res.status(200).json({ data: { ...result, correlationId: context.correlationId } });
    } catch (error) { sendError(error, res, next, context.correlationId); }
  },
);

paymentEventsRouter.get(
  "/:paymentId/refunds/:refundId/events",
  requireIntegrationAuth(["refunds:read"]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const context = req.financeContext;
    if (!context) { res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "A verified Finance context is required." } }); return; }
    const paymentId = z.string().uuid().safeParse(req.params["paymentId"]);
    const refundId = z.string().uuid().safeParse(req.params["refundId"]);
    const query = querySchema.safeParse(req.query);
    if (!paymentId.success || !refundId.success) { res.status(400).json({ error: { code: "INVALID_RESOURCE_ID", message: "Payment and refund IDs must be UUIDs." } }); return; }
    if (!query.success) { res.status(400).json({ error: { code: "INVALID_EVENT_QUERY", message: "The event query is invalid." } }); return; }
    try {
      const result = await paymentEventsService.listRefundEvents(context, paymentId.data, refundId.data, query.data.limit, query.data.cursor);
      res.status(200).json({ data: { ...result, correlationId: context.correlationId } });
    } catch (error) { sendError(error, res, next, context.correlationId); }
  },
);
