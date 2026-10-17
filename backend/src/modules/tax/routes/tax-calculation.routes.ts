import { Router, type NextFunction, type Request, type Response } from "express";
import { requireIntegrationAuth } from "../../../middleware/require-integration-auth.js";
import { TaxCalculationServiceError, taxCalculationService } from "../services/tax-calculation.service.js";
import { calculateAndSnapshotTaxSchema } from "../validators/tax-calculation-request.schema.js";

export const taxCalculationRouter = Router();

taxCalculationRouter.post(
  "/calculate",
  requireIntegrationAuth(["tax:snapshot:write"]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const context = req.financeContext;
    if (!context) {
      res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "A verified Finance context is required." } });
      return;
    }

    const parsed = calculateAndSnapshotTaxSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: "INVALID_REQUEST",
          message: "The calculation request is invalid.",
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            code: issue.code,
            message: issue.message,
          })),
        },
      });
      return;
    }

    try {
      const snapshot = await taxCalculationService.calculateAndSnapshot(context, parsed.data);
      res.status(201).json({
        data: {
          snapshot,
          correlationId: context.correlationId,
        },
      });
    } catch (error) {
      if (error instanceof TaxCalculationServiceError) {
        const status = error.code === "SNAPSHOT_ALREADY_EXISTS" ? 409
          : error.code === "CURRENCY_NOT_SUPPORTED" ? 422
          : 422;
        res.status(status).json({ error: { code: error.code, message: error.message, correlationId: context.correlationId } });
        return;
      }
      next(error);
    }
  },
);
