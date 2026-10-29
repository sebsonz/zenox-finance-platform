import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { requireIntegrationAuth } from "../../../middleware/require-integration-auth.js";
import { CustomerServiceError, customerService } from "../services/customer.service.js";
import { createCustomerSchema, listCustomersQuerySchema, updateCustomerSchema } from "../validators/customer.schema.js";
import { CustomerRelationsServiceError, customerRelationsService } from "../services/customer-relations.service.js";
import { createCustomerAddressSchema, createCustomerContactSchema, listCustomerRelationsQuerySchema, updateCustomerAddressSchema, updateCustomerContactSchema } from "../validators/customer-relations.schema.js";

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


function parseCustomerId(req: Request, res: Response): string | null {
  const parsed = z.string().uuid().safeParse(req.params["customerId"]);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "INVALID_CUSTOMER_ID", message: "The customer ID must be a UUID." } });
    return null;
  }
  return parsed.data;
}

function sendRelationError(error: unknown, res: Response, correlationId: string): boolean {
  if (!(error instanceof CustomerRelationsServiceError)) return false;
  const status = error.code === "CUSTOMER_NOT_FOUND" ? 404
    : error.code === "PRIMARY_RELATION_CONFLICT" ? 409 : 422;
  res.status(status).json({ error: { code: error.code, message: error.message, correlationId } });
  return true;
}

customerRouter.post(
  "/:customerId/contacts",
  requireIntegrationAuth(["customer:write"]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const context = requireContext(req, res);
    if (!context) return;
    const customerId = parseCustomerId(req, res);
    if (!customerId) return;
    const parsed = createCustomerContactSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: "INVALID_CONTACT", message: "The customer contact is invalid." } });
      return;
    }
    try {
      const contact = await customerRelationsService.createContact(context, customerId, parsed.data);
      res.status(201).json({ data: { contact, correlationId: context.correlationId } });
    } catch (error) {
      if (sendRelationError(error, res, context.correlationId)) return;
      next(error);
    }
  },
);

customerRouter.get(
  "/:customerId/contacts",
  requireIntegrationAuth(["customer:read"]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const context = requireContext(req, res);
    if (!context) return;
    const customerId = parseCustomerId(req, res);
    if (!customerId) return;
    const parsed = listCustomerRelationsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: { code: "INVALID_QUERY", message: "The contact list query is invalid." } });
      return;
    }
    try {
      const rows = await customerRelationsService.listContacts(context, customerId, parsed.data);
      const hasMore = rows.length > parsed.data.limit;
      const contacts = hasMore ? rows.slice(0, parsed.data.limit) : rows;
      res.status(200).json({
        data: {
          contacts,
          page: { limit: parsed.data.limit, hasMore, nextCursor: hasMore ? contacts.at(-1)?.id ?? null : null },
          correlationId: context.correlationId,
        },
      });
    } catch (error) {
      if (sendRelationError(error, res, context.correlationId)) return;
      next(error);
    }
  },
);

customerRouter.post(
  "/:customerId/addresses",
  requireIntegrationAuth(["customer:write"]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const context = requireContext(req, res);
    if (!context) return;
    const customerId = parseCustomerId(req, res);
    if (!customerId) return;
    const parsed = createCustomerAddressSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: "INVALID_ADDRESS", message: "The customer address is invalid." } });
      return;
    }
    try {
      const address = await customerRelationsService.createAddress(context, customerId, parsed.data);
      res.status(201).json({ data: { address, correlationId: context.correlationId } });
    } catch (error) {
      if (sendRelationError(error, res, context.correlationId)) return;
      next(error);
    }
  },
);

customerRouter.get(
  "/:customerId/addresses",
  requireIntegrationAuth(["customer:read"]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const context = requireContext(req, res);
    if (!context) return;
    const customerId = parseCustomerId(req, res);
    if (!customerId) return;
    const parsed = listCustomerRelationsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: { code: "INVALID_QUERY", message: "The address list query is invalid." } });
      return;
    }
    try {
      const rows = await customerRelationsService.listAddresses(context, customerId, parsed.data);
      const hasMore = rows.length > parsed.data.limit;
      const addresses = hasMore ? rows.slice(0, parsed.data.limit) : rows;
      res.status(200).json({
        data: {
          addresses,
          page: { limit: parsed.data.limit, hasMore, nextCursor: hasMore ? addresses.at(-1)?.id ?? null : null },
          correlationId: context.correlationId,
        },
      });
    } catch (error) {
      if (sendRelationError(error, res, context.correlationId)) return;
      next(error);
    }
  },
);


customerRouter.patch(
  "/:customerId",
  requireIntegrationAuth(["customer:write"]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const context = requireContext(req, res);
    if (!context) return;
    const customerId = parseCustomerId(req, res);
    if (!customerId) return;
    const parsed = updateCustomerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: "INVALID_REQUEST", message: "The customer update is invalid." } });
      return;
    }
    try {
      const customer = await customerService.update(context, customerId, parsed.data);
      res.status(200).json({ data: { customer, correlationId: context.correlationId } });
    } catch (error) {
      if (error instanceof CustomerServiceError) {
        const status = error.code === "CUSTOMER_NOT_FOUND" ? 404
          : error.code === "CUSTOMER_ARCHIVED" || error.code === "CUSTOMER_CODE_CONFLICT" || error.code === "EXTERNAL_IDENTITY_CONFLICT" ? 409
          : 422;
        res.status(status).json({ error: { code: error.code, message: error.message, correlationId: context.correlationId } });
        return;
      }
      next(error);
    }
  },
);

customerRouter.post(
  "/:customerId/archive",
  requireIntegrationAuth(["customer:write"]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const context = requireContext(req, res);
    if (!context) return;
    const customerId = parseCustomerId(req, res);
    if (!customerId) return;
    try {
      const customer = await customerService.archive(context, customerId);
      res.status(200).json({ data: { customer, correlationId: context.correlationId } });
    } catch (error) {
      if (error instanceof CustomerServiceError && error.code === "CUSTOMER_NOT_FOUND") {
        res.status(404).json({ error: { code: error.code, message: error.message, correlationId: context.correlationId } });
        return;
      }
      next(error);
    }
  },
);


function relationId(req: Request, key: "contactId" | "addressId", res: Response): string | null {
  const parsed = z.string().uuid().safeParse(req.params[key]);
  if (!parsed.success) { res.status(400).json({ error: { code: "INVALID_RELATION_ID", message: "The relation ID must be a UUID." } }); return null; }
  return parsed.data;
}

customerRouter.patch("/:customerId/contacts/:contactId", requireIntegrationAuth(["customer:write"]), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const ctx = requireContext(req, res); if (!ctx) return;
  const cid = parseCustomerId(req, res); if (!cid) return;
  const rid = relationId(req, "contactId", res); if (!rid) return;
  const parsed = updateCustomerContactSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: { code: "INVALID_CONTACT", message: "The contact update is invalid." } }); return; }
  try { const contact = await customerRelationsService.updateContact(ctx, cid, rid, parsed.data); res.status(200).json({ data: { contact, correlationId: ctx.correlationId } }); }
  catch (error) { if (sendRelationError(error, res, ctx.correlationId)) return; next(error); }
});

customerRouter.post("/:customerId/contacts/:contactId/archive", requireIntegrationAuth(["customer:write"]), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const ctx = requireContext(req, res); if (!ctx) return;
  const cid = parseCustomerId(req, res); if (!cid) return;
  const rid = relationId(req, "contactId", res); if (!rid) return;
  try { const contact = await customerRelationsService.archiveContact(ctx, cid, rid); res.status(200).json({ data: { contact, correlationId: ctx.correlationId } }); }
  catch (error) { if (sendRelationError(error, res, ctx.correlationId)) return; next(error); }
});

customerRouter.patch("/:customerId/addresses/:addressId", requireIntegrationAuth(["customer:write"]), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const ctx = requireContext(req, res); if (!ctx) return;
  const cid = parseCustomerId(req, res); if (!cid) return;
  const rid = relationId(req, "addressId", res); if (!rid) return;
  const parsed = updateCustomerAddressSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: { code: "INVALID_ADDRESS", message: "The address update is invalid." } }); return; }
  try { const address = await customerRelationsService.updateAddress(ctx, cid, rid, parsed.data); res.status(200).json({ data: { address, correlationId: ctx.correlationId } }); }
  catch (error) { if (sendRelationError(error, res, ctx.correlationId)) return; next(error); }
});

customerRouter.post("/:customerId/addresses/:addressId/archive", requireIntegrationAuth(["customer:write"]), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const ctx = requireContext(req, res); if (!ctx) return;
  const cid = parseCustomerId(req, res); if (!cid) return;
  const rid = relationId(req, "addressId", res); if (!rid) return;
  try { const address = await customerRelationsService.archiveAddress(ctx, cid, rid); res.status(200).json({ data: { address, correlationId: ctx.correlationId } }); }
  catch (error) { if (sendRelationError(error, res, ctx.correlationId)) return; next(error); }
});
