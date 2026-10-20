import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { requireIntegrationAuth } from "../../../middleware/require-integration-auth.js";
import { PaymentServiceError, paymentService } from "../services/payment.service.js";
import { allocatePaymentSchema, createPaymentSchema, listPaymentsQuerySchema, reverseAllocationSchema } from "../validators/payment.schema.js";

export const paymentRouter = Router();

function idempotencyKey(req: Request, res: Response): string | null {
  const parsed = z.string().trim().min(8).max(128).safeParse(req.header("Idempotency-Key"));
  if (!parsed.success) {
    res.status(400).json({ error: { code: "INVALID_IDEMPOTENCY_KEY", message: "An Idempotency-Key header between 8 and 128 characters is required." } });
    return null;
  }
  return parsed.data;
}
function sendServiceError(error: unknown, res: Response, next: NextFunction, correlationId: string): void {
  if (error instanceof PaymentServiceError) {
    const conflictCodes = new Set([
      "IDEMPOTENCY_KEY_REUSED", "PAYMENT_NOT_PENDING", "PAYMENT_NOT_CONFIRMED", "PAYMENT_AMOUNT_EXCEEDED",
      "INVOICE_BALANCE_EXCEEDED", "INVOICE_NOT_ISSUED", "PAYMENT_CURRENCY_MISMATCH", "ALLOCATION_REVERSAL_EXCEEDED",
    ]);
    const notFoundCodes = new Set(["PAYMENT_NOT_FOUND", "INVOICE_NOT_FOUND", "ALLOCATION_NOT_FOUND"]);
    const forbiddenCodes = new Set(["PROVIDER_PAYMENT_REQUIRES_PROVIDER_CONFIRMATION"]);
    const status = conflictCodes.has(error.code) ? 409 : notFoundCodes.has(error.code) ? 404 :
      forbiddenCodes.has(error.code) ? 403 : error.code === "PROVIDER_ADAPTER_NOT_CONFIGURED" ? 501 : 422;
    res.status(status).json({ error: { code: error.code, message: error.message, correlationId } });
    return;
  }
  next(error);
}

paymentRouter.post(
  "/",
  requireIntegrationAuth(["payments:create"]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const context = req.financeContext;
    if (!context) { res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "A verified Finance context is required." } }); return; }
    const key = idempotencyKey(req, res);
    if (!key) return;
    const parsed = createPaymentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: "INVALID_REQUEST", message: "The payment request is invalid.",
        issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code, message: issue.message })) } });
      return;
    }
    try {
      const payment = await paymentService.create(context, parsed.data, key);
      res.status(201).json({ data: { payment, correlationId: context.correlationId } });
    } catch (error) { sendServiceError(error, res, next, context.correlationId); }
  },
);

paymentRouter.get(
  "/",
  requireIntegrationAuth(["payments:read"]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const context = req.financeContext;
    if (!context) { res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "A verified Finance context is required." } }); return; }
    const parsed = listPaymentsQuerySchema.safeParse(req.query);
    if (!parsed.success) { res.status(400).json({ error: { code: "INVALID_QUERY", message: "The payment query is invalid." } }); return; }
    try {
      res.status(200).json({ data: { ...(await paymentService.list(context, parsed.data)), correlationId: context.correlationId } });
    } catch (error) { sendServiceError(error, res, next, context.correlationId); }
  },
);

paymentRouter.get(
  "/:paymentId",
  requireIntegrationAuth(["payments:read"]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const context = req.financeContext;
    if (!context) { res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "A verified Finance context is required." } }); return; }
    const id = z.string().uuid().safeParse(req.params["paymentId"]);
    if (!id.success) { res.status(400).json({ error: { code: "INVALID_PAYMENT_ID", message: "The payment ID must be a UUID." } }); return; }
    try {
      const payment = await paymentService.get(context, id.data);
      res.status(200).json({ data: { payment, correlationId: context.correlationId } });
    } catch (error) { sendServiceError(error, res, next, context.correlationId); }
  },
);

paymentRouter.post(
  "/:paymentId/confirm-manual",
  requireIntegrationAuth(["payments:confirm_manual"]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const context = req.financeContext;
    if (!context) { res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "A verified Finance context is required." } }); return; }
    const id = z.string().uuid().safeParse(req.params["paymentId"]);
    if (!id.success) { res.status(400).json({ error: { code: "INVALID_PAYMENT_ID", message: "The payment ID must be a UUID." } }); return; }
    const key = idempotencyKey(req, res);
    if (!key) return;
    if (req.body && typeof req.body === "object" && Object.keys(req.body as object).length > 0) {
      res.status(400).json({ error: { code: "INVALID_REQUEST", message: "Manual confirmation does not accept a request body." } }); return;
    }
    try {
      const payment = await paymentService.confirmManual(context, id.data, key);
      res.status(200).json({ data: { payment, correlationId: context.correlationId } });
    } catch (error) { sendServiceError(error, res, next, context.correlationId); }
  },
);

paymentRouter.post(
  "/:paymentId/allocations",
  requireIntegrationAuth(["payments:allocate"]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const context = req.financeContext;
    if (!context) { res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "A verified Finance context is required." } }); return; }
    const id = z.string().uuid().safeParse(req.params["paymentId"]);
    if (!id.success) { res.status(400).json({ error: { code: "INVALID_PAYMENT_ID", message: "The payment ID must be a UUID." } }); return; }
    const key = idempotencyKey(req, res);
    if (!key) return;
    const parsed = allocatePaymentSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: { code: "INVALID_REQUEST", message: "The allocation request is invalid." } }); return; }
    try {
      const allocation = await paymentService.allocate(context, id.data, parsed.data, key);
      res.status(201).json({ data: { allocation, correlationId: context.correlationId } });
    } catch (error) { sendServiceError(error, res, next, context.correlationId); }
  },
);

paymentRouter.post(
  "/allocations/:allocationId/reversals",
  requireIntegrationAuth(["payments:reverse_allocation"]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const context = req.financeContext;
    if (!context) { res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "A verified Finance context is required." } }); return; }
    const id = z.string().uuid().safeParse(req.params["allocationId"]);
    if (!id.success) { res.status(400).json({ error: { code: "INVALID_ALLOCATION_ID", message: "The allocation ID must be a UUID." } }); return; }
    const key = idempotencyKey(req, res);
    if (!key) return;
    const parsed = reverseAllocationSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: { code: "INVALID_REQUEST", message: "The reversal request is invalid." } }); return; }
    try {
      const reversal = await paymentService.reverseAllocation(context, id.data, parsed.data, key);
      res.status(201).json({ data: { reversal, correlationId: context.correlationId } });
    } catch (error) { sendServiceError(error, res, next, context.correlationId); }
  },
);
