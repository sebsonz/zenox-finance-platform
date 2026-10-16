import { Router, type NextFunction, type Request, type Response } from "express";
import { requireIntegrationAuth } from "../../../middleware/require-integration-auth.js";
import { currencyRepository } from "../repositories/currency.repository.js";

export const currencyRouter = Router();

currencyRouter.get(
  "/",
  requireIntegrationAuth(["currency:read"]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const context = req.financeContext;
    if (!context) {
      res.status(401).json({
        error: { code: "UNAUTHENTICATED", message: "A verified Finance context is required." },
      });
      return;
    }

    try {
      const currencies = await currencyRepository.listActive();
      res.status(200).json({
        data: {
          currencies,
          count: currencies.length,
          correlationId: context.correlationId,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);
