import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { requireUserAuth } from "../../../middleware/require-user-auth.js";
import { registrationRepository } from "../repositories/registration.repository.js";

export const registrationRouter = Router();

const uuidSchema = z.string().uuid();
const submitSchema = z.object({
  legalName: z.string().trim().min(2).max(200),
  countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/),
  defaultCurrency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  acceptedTermsVersion: z.string().trim().min(1).max(40),
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

function userContext(req: Request, res: Response) {
  const user = req.financeUser;
  if (!user) {
    res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "A valid user session is required." } });
    return null;
  }
  return user;
}

function toRequest(row: {
  request_id: string;
  tenant_id: string;
  legal_name: string;
  country_code: string;
  default_currency: string;
  status: string;
  submitted_at: Date;
  updated_at: Date;
  rejection_reason: string | null;
}) {
  return {
    id: row.request_id,
    tenantId: row.tenant_id,
    legalName: row.legal_name,
    countryCode: row.country_code,
    defaultCurrency: row.default_currency,
    status: row.status,
    submittedAt: new Date(row.submitted_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    ...(row.rejection_reason ? { rejectionReason: row.rejection_reason } : {}),
  };
}

registrationRouter.post("/organizations", requireUserAuth(), async (req, res, next) => {
  if (!sameOrigin(req)) {
    res.status(403).json({ error: { code: "ORIGIN_NOT_ALLOWED", message: "The request origin is not allowed." } });
    return;
  }
  const user = userContext(req, res);
  if (!user) return;
  if (!user.emailConfirmedAt) {
    res.status(403).json({
      error: { code: "EMAIL_CONFIRMATION_REQUIRED", message: "Confirmez votre adresse e-mail avant de soumettre une organisation." },
    });
    return;
  }

  const parsed = submitSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Vérifiez les informations de l’organisation et l’acceptation des conditions.",
        details: parsed.error.issues.map((issue) => ({ field: issue.path.join("."), code: issue.code })),
      },
    });
    return;
  }

  try {
    const correlationId = String(res.locals["correlationId"] ?? "unknown");
    const row = await registrationRepository.submit({
      identityIssuer: user.issuer,
      identitySubject: user.id,
      legalName: parsed.data.legalName,
      countryCode: parsed.data.countryCode,
      defaultCurrency: parsed.data.defaultCurrency,
      acceptedTermsVersion: parsed.data.acceptedTermsVersion,
      correlationId,
    });
    res.setHeader("Cache-Control", "no-store");
    res.status(202).json({
      request: {
        id: row.request_id,
        tenantId: row.tenant_id,
        status: row.status,
        submittedAt: new Date(row.submitted_at).toISOString(),
      },
    });
  } catch (error) {
    const databaseError = error as { code?: string; message?: string };
    if (databaseError.code === "23505") {
      res.status(409).json({
        error: { code: "REGISTRATION_CONFLICT", message: "Une demande d’organisation est déjà en attente pour ce compte." },
      });
      return;
    }
    if (databaseError.code === "22023") {
      const code = databaseError.message === "UNSUPPORTED_CURRENCY" ? "UNSUPPORTED_CURRENCY" : "VALIDATION_ERROR";
      res.status(422).json({
        error: {
          code,
          message: code === "UNSUPPORTED_CURRENCY"
            ? "La devise choisie n’est pas disponible dans le référentiel Finance."
            : "Les informations de la demande ne sont pas valides.",
        },
      });
      return;
    }
    next(error);
  }
});

registrationRouter.get("/organizations", requireUserAuth(), async (req, res, next) => {
  const user = userContext(req, res);
  if (!user) return;
  try {
    const requests = await registrationRepository.listMine(user.issuer, user.id);
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ data: { requests: requests.map(toRequest) } });
  } catch (error) {
    next(error);
  }
});

registrationRouter.get("/organizations/:requestId", requireUserAuth(), async (req, res, next) => {
  const user = userContext(req, res);
  if (!user) return;
  const parsedId = uuidSchema.safeParse(req.params["requestId"]);
  if (!parsedId.success) {
    res.status(404).json({ error: { code: "REGISTRATION_NOT_FOUND", message: "La demande est introuvable." } });
    return;
  }
  try {
    const request = await registrationRepository.findMine(user.issuer, user.id, parsedId.data);
    res.setHeader("Cache-Control", "no-store");
    if (!request) {
      res.status(404).json({ error: { code: "REGISTRATION_NOT_FOUND", message: "La demande est introuvable." } });
      return;
    }
    res.status(200).json({ data: { request: toRequest(request) } });
  } catch (error) {
    next(error);
  }
});
