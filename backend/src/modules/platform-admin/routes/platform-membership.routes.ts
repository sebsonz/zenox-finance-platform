import { Router, type Request } from "express";
import { z } from "zod";
import { requireUserAuth } from "../../../middleware/require-user-auth.js";
import { platformMembershipRepository } from "../repositories/platform-membership.repository.js";

export const platformMembershipRouter = Router();

const memberSchema = z.object({
  targetSubject: z.string().trim().min(1).max(500),
  roleCode: z.enum([
    "PLATFORM_ADMIN",
    "PLATFORM_SECURITY_ADMIN",
    "PLATFORM_ORGANIZATION_ADMIN",
    "PLATFORM_TAX_ADMIN",
    "PLATFORM_SUPPORT_READONLY",
  ]),
  status: z.enum(["ACTIVE", "SUSPENDED"]),
  reason: z.string().trim().min(10).max(1000),
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

function sendError(error: unknown, res: import("express").Response): boolean {
  const message = (error as { message?: string })?.message ?? "";
  const known: Record<string, { status: number; message: string }> = {
    PLATFORM_MEMBERS_MANAGE_REQUIRED: { status: 403, message: "Le droit de gestion des opérateurs plateforme est requis." },
    PLATFORM_SUPER_ADMIN_REQUIRED: { status: 403, message: "Seul un Super Admin peut attribuer le rôle Super Admin." },
    SELF_MEMBERSHIP_CHANGE_NOT_ALLOWED: { status: 403, message: "Vous ne pouvez pas modifier votre propre habilitation." },
    LAST_ACTIVE_PLATFORM_ADMIN: { status: 409, message: "Le dernier Super Admin actif ne peut pas être suspendu." },
    INVALID_PLATFORM_MEMBER_CHANGE: { status: 422, message: "Les informations d’habilitation sont invalides." },
  };
  const item = known[message];
  if (!item) return false;
  res.status(item.status).json({ error: { code: message, message: item.message } });
  return true;
}

platformMembershipRouter.get("/members", requireUserAuth(), async (req, res, next) => {
  res.setHeader("Cache-Control", "no-store, private");
  const identity = req.financeUser;
  if (!identity) {
    res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Une session valide est requise." } });
    return;
  }
  if (!identity.emailConfirmedAt) {
    res.status(403).json({ error: { code: "EMAIL_CONFIRMATION_REQUIRED", message: "Confirmez votre adresse e-mail." } });
    return;
  }
  try {
    const items = await platformMembershipRepository.list(identity.issuer, identity.id);
    res.status(200).json({ data: { items } });
  } catch (error) {
    if (!sendError(error, res)) next(error);
  }
});

platformMembershipRouter.put("/members", requireUserAuth(), async (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  if (!sameOrigin(req)) {
    res.status(403).json({ error: { code: "ORIGIN_NOT_ALLOWED", message: "Origine de requête non autorisée." } });
    return;
  }
  const identity = req.financeUser;
  if (!identity) {
    res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Une session valide est requise." } });
    return;
  }
  if (!identity.emailConfirmedAt) {
    res.status(403).json({ error: { code: "EMAIL_CONFIRMATION_REQUIRED", message: "Confirmez votre adresse e-mail." } });
    return;
  }
  const parsed = memberSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Les informations d’habilitation sont invalides." } });
    return;
  }
  try {
    await platformMembershipRepository.set({
      actorIssuer: identity.issuer,
      actorSubject: identity.id,
      targetIssuer: identity.issuer,
      targetSubject: parsed.data.targetSubject,
      roleCode: parsed.data.roleCode,
      status: parsed.data.status,
      reason: parsed.data.reason,
      correlationId: String(res.locals["correlationId"] ?? "unknown"),
    });
    res.status(200).json({ data: { updated: true } });
  } catch (error) {
    if (!sendError(error, res)) next(error);
  }
});
