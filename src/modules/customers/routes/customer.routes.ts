import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { requireIntegrationAuth } from "../../../middleware/require-integration-auth.js";
import { CustomerServiceError, customerService } from "../services/customer.service.js";
import { createCustomerSchema, listCustomersQuerySchema } from "../validators/customer.schema.js";

export const customerRouter = Router();

function requireContext(req: Request, res: Response) {
  const context = req.financeContext;
  if (!context) {
    res.status(401).json({
      error: { code: "UNAUTHENTICATED", message: "A verified Finance context is required." },
    });
    return null;
  }
  return context;
}

customerRouter.post(
  "/",
  requireIntegrationAuth(["customer:write"]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const context = requireContext(req, res);
    if (!context) return;
    const parsed = createCustomerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: "INVALID_REQUEST",
          message: "The customer request is invalid.",
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
      const customer = await customerService.create(context, parsed.data);
      res.status(201).json({ data: { customer, correlationId: context.correlationId } });
    } catch (error) {
      if (error instanceof CustomerServiceError) {
        const status = error.code === "CUSTOMER_CODE_CONFLICT" || error.code === "EXTERNAL_IDENTITY_CONFLICT"
          ? 409
          : 422;
        res.status(status).json({
          error: { code: error.code, message: error.message, correlationId: context.correlationId },
        });
        return;
      }
      next(error);
    }
  },
);

customerRouter.get(
  "/",
  requireIntegrationAuth(["customer:read"]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const context = requireContext(req, res);
    if (!context) return;
    const parsed = listCustomersQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: "INVALID_QUERY", message: "The customer list query is invalid." },
      });
      return;
    }

    try {
      const customers = await customerService.list(context, parsed.data);
      const hasMore = customers.length > parsed.data.limit;
      const page = hasMore ? customers.slice(0, parsed.data.limit) : customers;
      const nextCursor = hasMore ? page.at(-1)?.id ?? null : null;
      res.status(200).json({
        data: {
          customers: page,
          page: { limit: parsed.data.limit, hasMore, nextCursor },
          correlationId: context.correlationId,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

customerRouter.get(
  "/:customerId",
  requireIntegrationAuth(["customer:read"]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const context = requireContext(req, res);
    if (!context) return;
    const parsedId = z.string().uuid().safeParse(req.params["customerId"]);
    if (!parsedId.success) {
      res.status(400).json({
        error: { code: "INVALID_CUSTOMER_ID", message: "The customer ID must be a UUID." },
      });
      return;
    }

    try {
      const customer = await customerService.findById(context, parsedId.data);
      if (!customer) {
        res.status(404).json({
          error: { code: "CUSTOMER_NOT_FOUND", message: "The customer was not found.", correlationId: context.correlationId },
        });
        return;
      }
      res.status(200).json({ data: { customer, correlationId: context.correlationId } });
    } catch (error) {
      next(error);
    }
  },
);
