import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { requireIntegrationAuth } from "../../../middleware/require-integration-auth.js";
import { ReconciliationServiceError, reconciliationService } from "../services/reconciliation.service.js";
import {
  reconciliationImportSchema,
  reconciliationListQuerySchema,
  reconciliationMatchSchema,
} from "../validators/reconciliation.schema.js";

export const reconciliationRouter = Router();

function serviceError(error: unknown, res: Response, next: NextFunction, correlationId: string): void {
  if (error instanceof ReconciliationServiceError) {
    const notFound = new Set(["RECONCILIATION_ITEM_NOT_FOUND", "RECONCILIATION_PAYMENT_NOT_FOUND"]);
    const conflict = new Set(["RECONCILIATION_ITEM_IGNORED", "RECONCILIATION_ALREADY_MATCHED"]);
    const status = notFound.has(error.code) ? 404 : conflict.has(error.code) ? 409 : 422;
    res.status(status).json({ error: { code: error.code, message: error.message, correlationId } });
    return;
  }
  next(error);
}

reconciliationRouter.post(
  "/reconciliation/import",
  requireIntegrationAuth(["reconciliation:manage"]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const context = req.financeContext;
    if (!context) { res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "A verified Finance context is required." } }); return; }
    const parsed = reconciliationImportSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: "INVALID_RECONCILIATION_IMPORT", message: "The reconciliation import is invalid.",
          issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code, message: issue.message })) },
      });
      return;
    }
    try {
      const result = await reconciliationService.import(context, parsed.data);
      res.status(200).json({ data: { ...result, correlationId: context.correlationId } });
    } catch (error) { serviceError(error, res, next, context.correlationId); }
  },
);

reconciliationRouter.get(
  "/reconciliation",
  requireIntegrationAuth(["reconciliation:read"]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const context = req.financeContext;
    if (!context) { res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "A verified Finance context is required." } }); return; }
    const parsed = reconciliationListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: { code: "INVALID_RECONCILIATION_QUERY", message: "The reconciliation query is invalid." } });
      return;
    }
    try {
      const result = await reconciliationService.list(context, parsed.data);
      res.status(200).json({ data: { ...result, correlationId: context.correlationId } });
    } catch (error) { serviceError(error, res, next, context.correlationId); }
  },
);

reconciliationRouter.post(
  "/reconciliation/:itemId/match",
  requireIntegrationAuth(["reconciliation:manage"]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const context = req.financeContext;
    if (!context) { res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "A verified Finance context is required." } }); return; }
    const itemId = z.string().uuid().safeParse(req.params["itemId"]);
    if (!itemId.success) { res.status(400).json({ error: { code: "INVALID_RECONCILIATION_ITEM_ID", message: "The reconciliation item ID must be a UUID." } }); return; }
    const parsed = reconciliationMatchSchema.safeParse(req.body ?? {});
    if (!parsed.success) { res.status(400).json({ error: { code: "INVALID_RECONCILIATION_MATCH", message: "The match request is invalid." } }); return; }
    try {
      const item = await reconciliationService.match(context, itemId.data, parsed.data);
      res.status(200).json({ data: { item, correlationId: context.correlationId } });
    } catch (error) { serviceError(error, res, next, context.correlationId); }
  },
);
