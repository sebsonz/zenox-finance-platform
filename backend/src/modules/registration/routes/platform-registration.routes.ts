import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { requireUserAuth } from "../../../middleware/require-user-auth.js";
import { registrationRepository } from "../repositories/registration.repository.js";

export const platformRegistrationRouter = Router();

const requestIdSchema = z.string().uuid();
const decisionSchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("APPROVE") }).strict(),
  z.object({ decision: z.literal("REJECT"), reason: z.string().trim().min(10).max(1000) }).strict(),
]);

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

function currentOperator(req: Request, res: Response) {
  const user = req.financeUser;
  if (!user) {
    res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "A valid user session is required." } });
    return null;
  }
  if (!user.emailConfirmedAt) {
    res.status(403).json({ error: { code: "EMAIL_CONFIRMATION_REQUIRED", message: "Confirmez votre adresse e-mail." } });
    return null;
  }
  return user;
}

function sendReviewError(error: unknown, res: Response): boolean {
  const databaseError = error as { code?: string; message?: string };
  if (databaseError.code === "42501") {
    const selfReview = databaseError.message === "SELF_REVIEW_NOT_ALLOWED";
    res.status(403).json({
      error: {
        code: selfReview ? "SELF_REVIEW_NOT_ALLOWED" : "PLATFORM_OPERATOR_REQUIRED",
        message: selfReview
          ? "Un opérateur ne peut pas examiner sa propre demande."
          : "Une autorisation d’administration de la plateforme est requise.",
      },
    });
    return true;
  }
  if (databaseError.code === "P0002") {
    res.status(404).json({ error: { code: "REGISTRATION_NOT_FOUND", message: "La demande est introuvable." } });
    return true;
  }
  if (databaseError.code === "P0001") {
    res.status(409).json({ error: { code: databaseError.message ?? "REGISTRATION_NOT_PENDING", message: "La demande a déjà été traitée ou son état a changé." } });
    return true;
  }
  if (databaseError.code === "22023") {
    res.status(422).json({ error: { code: databaseError.message ?? "INVALID_REVIEW_DECISION", message: "La décision ou le motif est invalide." } });
    return true;
  }
  return false;
}

platformRegistrationRouter.get("/me", requireUserAuth(), async (req, res, next) => {
  const user = currentOperator(req, res);
  if (!user) return;
  try {
    const isPlatformOperator = await registrationRepository.isPlatformOperator(user.issuer, user.id);
    if (!isPlatformOperator) {
      res.status(403).json({ error: { code: "PLATFORM_OPERATOR_REQUIRED", message: "Une autorisation d’administration de la plateforme est requise." } });
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ data: { isPlatformOperator: true } });
  } catch (error) {
    next(error);
  }
});

platformRegistrationRouter.get("/registration-requests", requireUserAuth(), async (req, res, next) => {
  const user = currentOperator(req, res);
  if (!user) return;
  try {
    const requests = await registrationRepository.listPendingForOperator(user.issuer, user.id);
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      data: {
        requests: requests.map((row) => ({
          id: row.request_id,
          tenantId: row.tenant_id,
          legalName: row.legal_name,
          countryCode: row.country_code,
          defaultCurrency: row.default_currency,
          submittedAt: row.submitted_at.toISOString(),
        })),
      },
    });
  } catch (error) {
    if (sendReviewError(error, res)) return;
    next(error);
  }
});

platformRegistrationRouter.post("/registration-requests/:requestId/decision", requireUserAuth(), async (req, res, next) => {
  if (!sameOrigin(req)) {
    res.status(403).json({ error: { code: "ORIGIN_NOT_ALLOWED", message: "The request origin is not allowed." } });
    return;
  }
  const user = currentOperator(req, res);
  if (!user) return;

  const parsedId = requestIdSchema.safeParse(req.params["requestId"]);
  const parsedBody = decisionSchema.safeParse(req.body);
  if (!parsedId.success || !parsedBody.success) {
    res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "La référence ou la décision de validation est invalide." },
    });
    return;
  }

  try {
    const decision = parsedBody.data.decision;
    const row = await registrationRepository.review({
      operatorIssuer: user.issuer,
      operatorSubject: user.id,
      requestId: parsedId.data,
      decision,
      rejectionReason: decision === "REJECT" ? parsedBody.data.reason : null,
      correlationId: String(res.locals["correlationId"] ?? "unknown"),
    });
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      data: {
        request: {
          id: row.request_id,
          tenantId: row.tenant_id,
          status: row.status,
          decidedAt: row.decided_at.toISOString(),
        },
      },
    });
  } catch (error) {
    if (sendReviewError(error, res)) return;
    next(error);
  }
});
