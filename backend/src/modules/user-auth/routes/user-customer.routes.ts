import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { requireUserAuth } from "../../../middleware/require-user-auth.js";
import { customerService, CustomerServiceError } from "../../customers/services/customer.service.js";
import { customerRelationsService, CustomerRelationsServiceError } from "../../customers/services/customer-relations.service.js";
import { createCustomerSchema, listCustomersQuerySchema, updateCustomerSchema } from "../../customers/validators/customer.schema.js";
import { createCustomerContactSchema, createCustomerAddressSchema, updateCustomerContactSchema, updateCustomerAddressSchema, listCustomerRelationsQuerySchema } from "../../customers/validators/customer-relations.schema.js";
import { userTenantMembershipRepository } from "../../tenants/repositories/user-tenant-membership.repository.js";
import { assertActiveMembershipCan } from "../../tenants/services/user-tenant-permissions.service.js";
import { tenantRepository } from "../../tenants/repositories/tenant.repository.js";
import type { FinanceCustomerOperationContext } from "../../customers/types/customer-operation-context.js";

export const userCustomerRouter = Router();
const uuidSchema = z.string().uuid();

userCustomerRouter.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

async function resolveCustomerReadContext(
  tenantId: string,
  req: Request,
  res: Response,
  permission: "customers:read" | "customers:manage" = "customers:read",
): Promise<FinanceCustomerOperationContext | null> {
  const user = req.financeUser;
  if (!user) {
    res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "A valid user access token is required." } });
    return null;
  }
  const membership = await userTenantMembershipRepository.findActiveMembership(tenantId, user.issuer, user.id);
  if (!membership) {
    res.status(403).json({ error: { code: "TENANT_ACCESS_DENIED", message: "The user is not an active member of this tenant." } });
    return null;
  }
  try {
    assertActiveMembershipCan(membership, permission);
  } catch {
    res.status(403).json({ error: { code: "CUSTOMER_ACCESS_DENIED", message: "The user is not authorized for this customer operation." } });
    return null;
  }
  const tenant = await tenantRepository.findActiveById(tenantId);
  if (!tenant) {
    res.status(404).json({ error: { code: "TENANT_NOT_AVAILABLE", message: "The requested tenant is not available." } });
    return null;
  }
  return {
    tenantId,
    correlationId: String(res.locals["correlationId"] ?? ""),
    actor: {
      type: "USER",
      ref: `${user.issuer}|${user.id}`,
      membershipId: membership.id,
      identityIssuer: user.issuer,
      identitySubject: user.id,
    },
  };
}

function parseTenantId(req: Request, res: Response): string | null {
  const parsed = uuidSchema.safeParse(req.params["tenantId"]);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "INVALID_TENANT_ID", message: "A valid tenant ID is required." } });
    return null;
  }
  return parsed.data;
}

function sendCustomerError(error: unknown, res: Response, correlationId: string): boolean {
  if (error instanceof CustomerServiceError) {
    const status = error.code === "CUSTOMER_NOT_FOUND" ? 404 : 422;
    res.status(status).json({ error: { code: error.code, message: error.message, correlationId } });
    return true;
  }
  if (error instanceof CustomerRelationsServiceError) {
    const status = error.code === "CUSTOMER_NOT_FOUND" || error.code === "RELATION_NOT_FOUND" ? 404 : 409;
    res.status(status).json({ error: { code: error.code, message: error.message, correlationId } });
    return true;
  }
  return false;
}

userCustomerRouter.get("/:tenantId/customers", requireUserAuth(), async (req, res, next) => {
  const tenantId = parseTenantId(req, res);
  if (!tenantId) return;
  const query = listCustomersQuerySchema.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: { code: "INVALID_QUERY", message: "The customer list query is invalid." } });
    return;
  }
  try {
    const context = await resolveCustomerReadContext(tenantId, req, res);
    if (!context) return;
    const rows = await customerService.list(context, query.data);
    const hasMore = rows.length > query.data.limit;
    const customers = hasMore ? rows.slice(0, query.data.limit) : rows;
    res.status(200).json({
      data: {
        customers,
        page: { limit: query.data.limit, hasMore, nextCursor: hasMore ? customers.at(-1)?.id ?? null : null },
        correlationId: context.correlationId,
      },
    });
  } catch (error) { next(error); }
});

userCustomerRouter.get("/:tenantId/customers/:customerId", requireUserAuth(), async (req, res, next) => {
  const tenantId = parseTenantId(req, res);
  if (!tenantId) return;
  const customerId = uuidSchema.safeParse(req.params["customerId"]);
  if (!customerId.success) {
    res.status(400).json({ error: { code: "INVALID_CUSTOMER_ID", message: "A valid customer ID is required." } });
    return;
  }
  try {
    const context = await resolveCustomerReadContext(tenantId, req, res);
    if (!context) return;
    const customer = await customerService.findById(context, customerId.data);
    if (!customer) {
      res.status(404).json({ error: { code: "CUSTOMER_NOT_FOUND", message: "The customer was not found.", correlationId: context.correlationId } });
      return;
    }
    res.status(200).json({ data: { customer, correlationId: context.correlationId } });
  } catch (error) { next(error); }
});

userCustomerRouter.get("/:tenantId/customers/:customerId/contacts", requireUserAuth(), async (req, res, next) => {
  const tenantId = parseTenantId(req, res);
  if (!tenantId) return;
  const customerId = uuidSchema.safeParse(req.params["customerId"]);
  const query = listCustomerRelationsQuerySchema.safeParse(req.query);
  if (!customerId.success) {
    res.status(400).json({ error: { code: "INVALID_CUSTOMER_ID", message: "A valid customer ID is required." } });
    return;
  }
  if (!query.success) {
    res.status(400).json({ error: { code: "INVALID_QUERY", message: "The contact list query is invalid." } });
    return;
  }
  try {
    const context = await resolveCustomerReadContext(tenantId, req, res);
    if (!context) return;
    const rows = await customerRelationsService.listContacts(context, customerId.data, query.data);
    const hasMore = rows.length > query.data.limit;
    const contacts = hasMore ? rows.slice(0, query.data.limit) : rows;
    res.status(200).json({ data: { contacts, page: { limit: query.data.limit, hasMore, nextCursor: hasMore ? contacts.at(-1)?.id ?? null : null }, correlationId: context.correlationId } });
  } catch (error) {
    if (sendCustomerError(error, res, String(res.locals["correlationId"] ?? ""))) return;
    next(error);
  }
});

userCustomerRouter.get("/:tenantId/customers/:customerId/addresses", requireUserAuth(), async (req, res, next) => {
  const tenantId = parseTenantId(req, res);
  if (!tenantId) return;
  const customerId = uuidSchema.safeParse(req.params["customerId"]);
  const query = listCustomerRelationsQuerySchema.safeParse(req.query);
  if (!customerId.success) {
    res.status(400).json({ error: { code: "INVALID_CUSTOMER_ID", message: "A valid customer ID is required." } });
    return;
  }
  if (!query.success) {
    res.status(400).json({ error: { code: "INVALID_QUERY", message: "The address list query is invalid." } });
    return;
  }
  try {
    const context = await resolveCustomerReadContext(tenantId, req, res);
    if (!context) return;
    const rows = await customerRelationsService.listAddresses(context, customerId.data, query.data);
    const hasMore = rows.length > query.data.limit;
    const addresses = hasMore ? rows.slice(0, query.data.limit) : rows;
    res.status(200).json({ data: { addresses, page: { limit: query.data.limit, hasMore, nextCursor: hasMore ? addresses.at(-1)?.id ?? null : null }, correlationId: context.correlationId } });
  } catch (error) {
    if (sendCustomerError(error, res, String(res.locals["correlationId"] ?? ""))) return;
    next(error);
  }
});


function sendCustomerWriteError(error: unknown, res: Response, correlationId: string): boolean {
  if (error instanceof CustomerServiceError) {
    const status = error.code === "CUSTOMER_NOT_FOUND" ? 404
      : error.code === "CUSTOMER_ARCHIVED" || error.code === "CUSTOMER_CODE_CONFLICT" || error.code === "EXTERNAL_IDENTITY_CONFLICT" ? 409
      : 422;
    res.status(status).json({ error: { code: error.code, message: error.message, correlationId } });
    return true;
  }
  if (error instanceof CustomerRelationsServiceError) {
    const status = error.code === "CUSTOMER_NOT_FOUND" || error.code === "RELATION_NOT_FOUND" ? 404
      : error.code === "CUSTOMER_ARCHIVED" || error.code === "PRIMARY_RELATION_CONFLICT" ? 409 : 422;
    res.status(status).json({ error: { code: error.code, message: error.message, correlationId } });
    return true;
  }
  return false;
}

userCustomerRouter.post("/:tenantId/customers", requireUserAuth(), async (req, res, next) => {
  const tenantId = parseTenantId(req, res); if (!tenantId) return;
  const parsed = createCustomerSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: { code: "INVALID_CUSTOMER", message: "The customer payload is invalid." } }); return; }
  try {
    const context = await resolveCustomerReadContext(tenantId, req, res, "customers:manage"); if (!context) return;
    const customer = await customerService.create(context, parsed.data);
    res.status(201).json({ data: { customer, correlationId: context.correlationId } });
  } catch (error) { if (sendCustomerWriteError(error, res, String(res.locals["correlationId"] ?? ""))) return; next(error); }
});

userCustomerRouter.patch("/:tenantId/customers/:customerId", requireUserAuth(), async (req, res, next) => {
  const tenantId = parseTenantId(req, res); if (!tenantId) return;
  const customerId = uuidSchema.safeParse(req.params["customerId"]);
  const parsed = updateCustomerSchema.safeParse(req.body);
  if (!customerId.success) { res.status(400).json({ error: { code: "INVALID_CUSTOMER_ID", message: "A valid customer ID is required." } }); return; }
  if (!parsed.success) { res.status(400).json({ error: { code: "INVALID_CUSTOMER", message: "The customer update is invalid." } }); return; }
  try {
    const context = await resolveCustomerReadContext(tenantId, req, res, "customers:manage"); if (!context) return;
    const customer = await customerService.update(context, customerId.data, parsed.data);
    res.status(200).json({ data: { customer, correlationId: context.correlationId } });
  } catch (error) { if (sendCustomerWriteError(error, res, String(res.locals["correlationId"] ?? ""))) return; next(error); }
});

userCustomerRouter.post("/:tenantId/customers/:customerId/archive", requireUserAuth(), async (req, res, next) => {
  const tenantId = parseTenantId(req, res); if (!tenantId) return;
  const customerId = uuidSchema.safeParse(req.params["customerId"]);
  if (!customerId.success) { res.status(400).json({ error: { code: "INVALID_CUSTOMER_ID", message: "A valid customer ID is required." } }); return; }
  try {
    const context = await resolveCustomerReadContext(tenantId, req, res, "customers:manage"); if (!context) return;
    const customer = await customerService.archive(context, customerId.data);
    res.status(200).json({ data: { customer, correlationId: context.correlationId } });
  } catch (error) { if (sendCustomerWriteError(error, res, String(res.locals["correlationId"] ?? ""))) return; next(error); }
});

userCustomerRouter.post("/:tenantId/customers/:customerId/contacts", requireUserAuth(), async (req, res, next) => {
  const tenantId = parseTenantId(req, res); if (!tenantId) return;
  const customerId = uuidSchema.safeParse(req.params["customerId"]);
  const parsed = createCustomerContactSchema.safeParse(req.body);
  if (!customerId.success) { res.status(400).json({ error: { code: "INVALID_CUSTOMER_ID", message: "A valid customer ID is required." } }); return; }
  if (!parsed.success) { res.status(400).json({ error: { code: "INVALID_CONTACT", message: "The contact payload is invalid." } }); return; }
  try {
    const context = await resolveCustomerReadContext(tenantId, req, res, "customers:manage"); if (!context) return;
    const contact = await customerRelationsService.createContact(context, customerId.data, parsed.data);
    res.status(201).json({ data: { contact, correlationId: context.correlationId } });
  } catch (error) { if (sendCustomerWriteError(error, res, String(res.locals["correlationId"] ?? ""))) return; next(error); }
});

userCustomerRouter.patch("/:tenantId/customers/:customerId/contacts/:contactId", requireUserAuth(), async (req, res, next) => {
  const tenantId = parseTenantId(req, res); if (!tenantId) return;
  const customerId = uuidSchema.safeParse(req.params["customerId"]), contactId = uuidSchema.safeParse(req.params["contactId"]);
  const parsed = updateCustomerContactSchema.safeParse(req.body);
  if (!customerId.success || !contactId.success) { res.status(400).json({ error: { code: "INVALID_RELATION_ID", message: "Valid customer and contact IDs are required." } }); return; }
  if (!parsed.success) { res.status(400).json({ error: { code: "INVALID_CONTACT", message: "The contact update is invalid." } }); return; }
  try {
    const context = await resolveCustomerReadContext(tenantId, req, res, "customers:manage"); if (!context) return;
    const contact = await customerRelationsService.updateContact(context, customerId.data, contactId.data, parsed.data);
    res.status(200).json({ data: { contact, correlationId: context.correlationId } });
  } catch (error) { if (sendCustomerWriteError(error, res, String(res.locals["correlationId"] ?? ""))) return; next(error); }
});

userCustomerRouter.post("/:tenantId/customers/:customerId/contacts/:contactId/archive", requireUserAuth(), async (req, res, next) => {
  const tenantId = parseTenantId(req, res); if (!tenantId) return;
  const customerId = uuidSchema.safeParse(req.params["customerId"]), contactId = uuidSchema.safeParse(req.params["contactId"]);
  if (!customerId.success || !contactId.success) { res.status(400).json({ error: { code: "INVALID_RELATION_ID", message: "Valid customer and contact IDs are required." } }); return; }
  try {
    const context = await resolveCustomerReadContext(tenantId, req, res, "customers:manage"); if (!context) return;
    const contact = await customerRelationsService.archiveContact(context, customerId.data, contactId.data);
    res.status(200).json({ data: { contact, correlationId: context.correlationId } });
  } catch (error) { if (sendCustomerWriteError(error, res, String(res.locals["correlationId"] ?? ""))) return; next(error); }
});

userCustomerRouter.post("/:tenantId/customers/:customerId/addresses", requireUserAuth(), async (req, res, next) => {
  const tenantId = parseTenantId(req, res); if (!tenantId) return;
  const customerId = uuidSchema.safeParse(req.params["customerId"]);
  const parsed = createCustomerAddressSchema.safeParse(req.body);
  if (!customerId.success) { res.status(400).json({ error: { code: "INVALID_CUSTOMER_ID", message: "A valid customer ID is required." } }); return; }
  if (!parsed.success) { res.status(400).json({ error: { code: "INVALID_ADDRESS", message: "The address payload is invalid." } }); return; }
  try {
    const context = await resolveCustomerReadContext(tenantId, req, res, "customers:manage"); if (!context) return;
    const address = await customerRelationsService.createAddress(context, customerId.data, parsed.data);
    res.status(201).json({ data: { address, correlationId: context.correlationId } });
  } catch (error) { if (sendCustomerWriteError(error, res, String(res.locals["correlationId"] ?? ""))) return; next(error); }
});

userCustomerRouter.patch("/:tenantId/customers/:customerId/addresses/:addressId", requireUserAuth(), async (req, res, next) => {
  const tenantId = parseTenantId(req, res); if (!tenantId) return;
  const customerId = uuidSchema.safeParse(req.params["customerId"]), addressId = uuidSchema.safeParse(req.params["addressId"]);
  const parsed = updateCustomerAddressSchema.safeParse(req.body);
  if (!customerId.success || !addressId.success) { res.status(400).json({ error: { code: "INVALID_RELATION_ID", message: "Valid customer and address IDs are required." } }); return; }
  if (!parsed.success) { res.status(400).json({ error: { code: "INVALID_ADDRESS", message: "The address update is invalid." } }); return; }
  try {
    const context = await resolveCustomerReadContext(tenantId, req, res, "customers:manage"); if (!context) return;
    const address = await customerRelationsService.updateAddress(context, customerId.data, addressId.data, parsed.data);
    res.status(200).json({ data: { address, correlationId: context.correlationId } });
  } catch (error) { if (sendCustomerWriteError(error, res, String(res.locals["correlationId"] ?? ""))) return; next(error); }
});

userCustomerRouter.post("/:tenantId/customers/:customerId/addresses/:addressId/archive", requireUserAuth(), async (req, res, next) => {
  const tenantId = parseTenantId(req, res); if (!tenantId) return;
  const customerId = uuidSchema.safeParse(req.params["customerId"]), addressId = uuidSchema.safeParse(req.params["addressId"]);
  if (!customerId.success || !addressId.success) { res.status(400).json({ error: { code: "INVALID_RELATION_ID", message: "Valid customer and address IDs are required." } }); return; }
  try {
    const context = await resolveCustomerReadContext(tenantId, req, res, "customers:manage"); if (!context) return;
    const address = await customerRelationsService.archiveAddress(context, customerId.data, addressId.data);
    res.status(200).json({ data: { address, correlationId: context.correlationId } });
  } catch (error) { if (sendCustomerWriteError(error, res, String(res.locals["correlationId"] ?? ""))) return; next(error); }
});
