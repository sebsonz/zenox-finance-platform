import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { requireUserAuth } from "../../../middleware/require-user-auth.js";
import { organizationLifecycleRepository } from "../repositories/organization-lifecycle.repository.js";

export const platformOrganizationLifecycleRouter = Router();

const tenantIdSchema = z.string().uuid();
const actionSchema = z.object({
  action: z.enum(["SUSPEND", "REACTIVATE"]),
  reason: z.string().trim().min(10).max(1000),
}).strict();

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

function sendLifecycleError(error: unknown, res: Response): boolean {
  const databaseError = error as { code?: string; message?: string };
  if (databaseError.code === "42501") {
    res.status(403).json({ error: { code: "PLATFORM_OPERATOR_REQUIRED", message: "Une autorisation d’administration de la plateforme est requise." } });
    return true;
  }
  if (databaseError.code === "P0002") {
    res.status(404).json({ error: { code: "ORGANIZATION_NOT_FOUND", message: "L’organisation est introuvable." } });
    return true;
  }
  if (databaseError.code === "P0001") {
    res.status(409).json({ error: { code: "ORGANIZATION_STATUS_TRANSITION_NOT_ALLOWED", message: "Cette transition de statut n’est pas autorisée depuis l’état actuel." } });
    return true;
  }
  if (databaseError.code === "22023") {
    res.status(422).json({ error: { code: databaseError.message ?? "INVALID_ORGANIZATION_ACTION", message: "L’action ou son motif est invalide." } });
    return true;
  }
  return false;
}

platformOrganizationLifecycleRouter.patch("/organizations/:tenantId/status", requireUserAuth(), async (req, res, next) => {
  if (!sameOrigin(req)) {
    res.status(403).json({ error: { code: "ORIGIN_NOT_ALLOWED", message: "The request origin is not allowed." } });
    return;
  }
  const user = req.financeUser;
  if (!user) {
    res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "A valid user session is required." } });
    return;
  }
  if (!user.emailConfirmedAt) {
    res.status(403).json({ error: { code: "EMAIL_CONFIRMATION_REQUIRED", message: "Confirmez votre adresse e-mail." } });
    return;
  }

  const parsedId = tenantIdSchema.safeParse(req.params["tenantId"]);
  const parsedBody = actionSchema.safeParse(req.body);
  if (!parsedId.success || !parsedBody.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "L’organisation, l’action ou le motif est invalide." } });
    return;
  }

  try {
    const row = await organizationLifecycleRepository.apply({
      operatorIssuer: user.issuer,
      operatorSubject: user.id,
      tenantId: parsedId.data,
      action: parsedBody.data.action,
      reason: parsedBody.data.reason,
      correlationId: String(res.locals["correlationId"] ?? "unknown"),
    });
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      data: {
        organization: {
          id: row.tenant_id,
          status: row.status,
          updatedAt: row.updated_at.toISOString(),
        },
      },
    });
  } catch (error) {
    if (sendLifecycleError(error, res)) return;
    next(error);
  }
});
