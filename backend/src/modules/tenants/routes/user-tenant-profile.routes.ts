import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { requireUserAuth } from "../../../middleware/require-user-auth.js";
import { userTenantMembershipRepository } from "../repositories/user-tenant-membership.repository.js";
import { tenantRepository } from "../repositories/tenant.repository.js";
import { assertActiveMembershipCan } from "../services/user-tenant-permissions.service.js";
import { tenantProfileService, TenantProfileServiceError } from "../application/use-cases/tenant-profile.service.js";
import { createTenantAddressSchema, updateTenantProfileSchema } from "../schemas/tenant-profile.schema.js";
import type { FinanceUserTenantContext } from "../application/tenant-profile-operation-context.js";

export const userTenantProfileRouter = Router();
const uuidSchema = z.string().uuid();

function sameOrigin(req: Request): boolean {
  const origin = req.header("origin");
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    return (parsed.protocol === "https:" || parsed.protocol === "http:") &&
      parsed.host.toLowerCase() === (req.get("host") ?? "").toLowerCase();
  } catch {
    return false;
  }
}

userTenantProfileRouter.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

function parseTenantId(req: Request, res: Response): string | null {
  const parsed = uuidSchema.safeParse(req.params["tenantId"]);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "INVALID_TENANT_ID", message: "A valid tenant ID is required." } });
    return null;
  }
  return parsed.data;
}

async function resolveTenantProfileContext(
  tenantId: string,
  req: Request,
  res: Response,
  permission: "tenant:read" | "settings:manage",
): Promise<FinanceUserTenantContext | null> {
  const user = req.financeUser;
  if (!user) {
    res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "A valid user access token is required." } });
    return null;
  }

  const membership = await userTenantMembershipRepository.findActiveMembership(
    tenantId,
    user.issuer,
    user.id,
  );
  if (!membership) {
    res.status(403).json({ error: { code: "TENANT_ACCESS_DENIED", message: "The user is not an active member of this tenant." } });
    return null;
  }

  try {
    assertActiveMembershipCan(membership, permission);
  } catch {
    res.status(403).json({ error: { code: "TENANT_PROFILE_ACCESS_DENIED", message: "The user is not authorized for this tenant profile operation." } });
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

function sendProfileError(error: unknown, res: Response, correlationId: string): boolean {
  if (error instanceof TenantProfileServiceError) {
    const status = error.code === "PRIMARY_ADDRESS_CONFLICT" ? 409 : 422;
    res.status(status).json({ error: { code: error.code, message: error.message, correlationId } });
    return true;
  }
  return false;
}

userTenantProfileRouter.get("/:tenantId/profile", requireUserAuth(), async (req, res, next) => {
  const tenantId = parseTenantId(req, res);
  if (!tenantId) return;
  try {
    const context = await resolveTenantProfileContext(tenantId, req, res, "tenant:read");
    if (!context) return;
    const profile = await tenantProfileService.getProfile(context);
    res.status(200).json({ data: { profile, correlationId: context.correlationId } });
  } catch (error) { next(error); }
});

userTenantProfileRouter.put("/:tenantId/profile", requireUserAuth(), async (req, res, next) => {
  const tenantId = parseTenantId(req, res);
  if (!tenantId) return;
  if (!sameOrigin(req)) {
    res.status(403).json({ error: { code: "ORIGIN_NOT_ALLOWED", message: "The request origin is not allowed." } });
    return;
  }
  const parsed = updateTenantProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "INVALID_TENANT_PROFILE", message: "The tenant profile payload is invalid." } });
    return;
  }
  try {
    const context = await resolveTenantProfileContext(tenantId, req, res, "settings:manage");
    if (!context) return;
    const profile = await tenantProfileService.updateProfile(context, parsed.data);
    res.status(200).json({ data: { profile, correlationId: context.correlationId } });
  } catch (error) {
    if (sendProfileError(error, res, String(res.locals["correlationId"] ?? ""))) return;
    next(error);
  }
});

userTenantProfileRouter.get("/:tenantId/addresses", requireUserAuth(), async (req, res, next) => {
  const tenantId = parseTenantId(req, res);
  if (!tenantId) return;
  try {
    const context = await resolveTenantProfileContext(tenantId, req, res, "tenant:read");
    if (!context) return;
    const addresses = await tenantProfileService.listActiveAddresses(context);
    res.status(200).json({ data: { addresses, correlationId: context.correlationId } });
  } catch (error) { next(error); }
});

userTenantProfileRouter.post("/:tenantId/addresses", requireUserAuth(), async (req, res, next) => {
  const tenantId = parseTenantId(req, res);
  if (!tenantId) return;
  if (!sameOrigin(req)) {
    res.status(403).json({ error: { code: "ORIGIN_NOT_ALLOWED", message: "The request origin is not allowed." } });
    return;
  }
  const parsed = createTenantAddressSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "INVALID_TENANT_ADDRESS", message: "The tenant address payload is invalid." } });
    return;
  }
  try {
    const context = await resolveTenantProfileContext(tenantId, req, res, "settings:manage");
    if (!context) return;
    const address = await tenantProfileService.createAddress(context, parsed.data);
    res.status(201).json({ data: { address, correlationId: context.correlationId } });
  } catch (error) {
    if (sendProfileError(error, res, String(res.locals["correlationId"] ?? ""))) return;
    next(error);
  }
});

userTenantProfileRouter.get("/:tenantId/profile-completion", requireUserAuth(), async (req, res, next) => {
  const tenantId = parseTenantId(req, res);
  if (!tenantId) return;
  try {
    const context = await resolveTenantProfileContext(tenantId, req, res, "tenant:read");
    if (!context) return;
    const completion = await tenantProfileService.checkProfileCompletion(context);
    res.status(200).json({ data: { completion, correlationId: context.correlationId } });
  } catch (error) { next(error); }
});
