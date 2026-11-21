import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { requireUserAuth } from "../../../middleware/require-user-auth.js";
import { platformAdminAccessService, PlatformAdminAccessError } from "../services/platform-admin-access.service.js";
import { platformOrganizationAdminRepository } from "../repositories/platform-organization-admin.repository.js";

export const platformOrganizationAdminRouter = Router();

const idSchema = z.string().uuid();
const reasonSchema = z.string().trim().min(10).max(1000);
const profileSchema = z.object({
  tradeName: z.string().trim().max(200).nullable(),
  timezone: z.string().trim().min(1).max(80),
  primaryLanguage: z.string().trim().min(2).max(35),
  supportedLanguages: z.array(z.string().trim().min(2).max(35)).min(1).max(20),
  websiteUrl: z.string().trim().max(2048).url().nullable(),
  generalEmail: z.string().trim().max(254).email().nullable(),
  generalPhone: z.string().trim().max(40).nullable(),
  reason: reasonSchema,
}).strict().superRefine((value, context) => {
  if (!value.supportedLanguages.includes(value.primaryLanguage)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["supportedLanguages"], message: "La langue principale doit être prise en charge." });
  }
});
const memberSchema = z.object({
  role: z.enum(["OWNER", "ADMIN", "FINANCE_MANAGER", "FINANCE_OPERATOR", "VIEWER"]),
  status: z.enum(["PENDING", "ACTIVE", "SUSPENDED", "REVOKED"]),
  reason: reasonSchema,
}).strict();

function sameOrigin(req: Request): boolean {
  const origin = req.header("origin");
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    return (parsed.protocol === "https:" || parsed.protocol === "http:") &&
      parsed.host.toLowerCase() === (req.get("host") ?? "").toLowerCase();
  } catch { return false; }
}

function sendError(error: unknown, res: Response): boolean {
  const databaseError = error as { code?: string; message?: string };
  if (databaseError.code === "42501" || error instanceof PlatformAdminAccessError) {
    const status = error instanceof PlatformAdminAccessError ? error.status : 403;
    const code = error instanceof PlatformAdminAccessError ? error.code : "PLATFORM_OPERATOR_REQUIRED";
    res.status(status).json({ error: { code, message: error instanceof Error ? error.message : "Accès administrateur requis." } });
    return true;
  }
  if (databaseError.code === "P0002") {
    res.status(404).json({ error: { code: "ORGANIZATION_NOT_FOUND", message: "L’organisation ou le membre est introuvable." } });
    return true;
  }
  if (databaseError.code === "23514" && databaseError.message === "LAST_ACTIVE_OWNER") {
    res.status(409).json({ error: { code: "LAST_ACTIVE_OWNER", message: "Une organisation doit conserver au moins un propriétaire actif." } });
    return true;
  }
  if (databaseError.code === "22023") {
    res.status(422).json({ error: { code: databaseError.message ?? "INVALID_ORGANIZATION_INPUT", message: "Les informations ou le motif fourni sont invalides." } });
    return true;
  }
  return false;
}

async function authorize(req: Request, res: Response) {
  try {
    await platformAdminAccessService.assertActiveOperator(req.financeUser);
    return req.financeUser!;
  } catch (error) {
    sendError(error, res);
    return null;
  }
}

platformOrganizationAdminRouter.get("/organizations/:tenantId", requireUserAuth(), async (req, res, next) => {
  const user = await authorize(req, res);
  if (!user) return;
  const tenantId = idSchema.safeParse(req.params["tenantId"]);
  if (!tenantId.success) {
    res.status(400).json({ error: { code: "INVALID_TENANT_ID", message: "Identifiant d’organisation invalide." } });
    return;
  }
  try {
    const dossier = await platformOrganizationAdminRepository.getDetails(user.issuer, user.id, tenantId.data);
    if (!dossier) {
      res.status(404).json({ error: { code: "ORGANIZATION_NOT_FOUND", message: "L’organisation est introuvable." } });
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ data: { organization: dossier } });
  } catch (error) {
    if (!sendError(error, res)) next(error);
  }
});

platformOrganizationAdminRouter.patch("/organizations/:tenantId/profile", requireUserAuth(), async (req, res, next) => {
  if (!sameOrigin(req)) {
    res.status(403).json({ error: { code: "ORIGIN_NOT_ALLOWED", message: "Origine de requête non autorisée." } });
    return;
  }
  const user = await authorize(req, res);
  if (!user) return;
  const tenantId = idSchema.safeParse(req.params["tenantId"]);
  const body = profileSchema.safeParse(req.body);
  if (!tenantId.success || !body.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Le profil ou le motif est invalide." } });
    return;
  }
  const { reason, ...profile } = body.data;
  try {
    const result = await platformOrganizationAdminRepository.updateProfile({
      operatorIssuer: user.issuer, operatorSubject: user.id, tenantId: tenantId.data,
      profile, reason, correlationId: String(res.locals["correlationId"] ?? "unknown"),
    });
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ data: { tenantId: result.tenant_id, updatedAt: result.updated_at.toISOString() } });
  } catch (error) {
    if (!sendError(error, res)) next(error);
  }
});

platformOrganizationAdminRouter.patch("/organizations/:tenantId/members/:memberId", requireUserAuth(), async (req, res, next) => {
  if (!sameOrigin(req)) {
    res.status(403).json({ error: { code: "ORIGIN_NOT_ALLOWED", message: "Origine de requête non autorisée." } });
    return;
  }
  const user = await authorize(req, res);
  if (!user) return;
  const tenantId = idSchema.safeParse(req.params["tenantId"]);
  const memberId = idSchema.safeParse(req.params["memberId"]);
  const body = memberSchema.safeParse(req.body);
  if (!tenantId.success || !memberId.success || !body.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Le membre, le rôle, le statut ou le motif est invalide." } });
    return;
  }
  try {
    const result = await platformOrganizationAdminRepository.updateMember({
      operatorIssuer: user.issuer, operatorSubject: user.id, tenantId: tenantId.data,
      memberId: memberId.data, role: body.data.role, status: body.data.status,
      reason: body.data.reason, correlationId: String(res.locals["correlationId"] ?? "unknown"),
    });
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ data: { memberId: result.member_id, role: result.role_code, status: result.status, updatedAt: result.updated_at.toISOString() } });
  } catch (error) {
    if (!sendError(error, res)) next(error);
  }
});
