import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { requireUserAuth } from "../../../middleware/require-user-auth.js";
import { onboardingService } from "../application/onboarding.service.js";
import { registrationConsentSchema, registrationPayloadSchema } from "../schemas/registration.schema.js";

export const onboardingRouter = Router();
const uuidSchema = z.string().uuid();

function sameOrigin(req: Request): boolean {
  const origin = req.header("origin");
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    return (parsed.protocol === "https:" || parsed.protocol === "http:") &&
      parsed.host.toLowerCase() === (req.get("host") ?? "").toLowerCase();
  } catch { return false; }
}

function context(req: Request, res: Response) {
  const user = req.financeUser;
  if (!user) {
    res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Une session utilisateur valide est requise." } });
    return null;
  }
  if (!user.emailConfirmedAt) {
    res.status(403).json({ error: { code: "EMAIL_CONFIRMATION_REQUIRED", message: "Confirmez votre adresse e-mail avant de continuer." } });
    return null;
  }
  return {
    identityIssuer: user.issuer,
    identitySubject: user.id,
    emailConfirmedAt: user.emailConfirmedAt,
    correlationId: String(res.locals["correlationId"] ?? "unknown"),
  };
}

function sendError(error: unknown, res: Response, next: (error?: unknown) => void) {
  const db = error as { code?: string; message?: string };
  if (db.message === "EMAIL_CONFIRMATION_REQUIRED") {
    res.status(403).json({ error: { code: "EMAIL_CONFIRMATION_REQUIRED", message: "Confirmez votre adresse e-mail." } });
    return;
  }
  if (db.code === "23505") {
    res.status(409).json({ error: { code: "REGISTRATION_CONFLICT", message: "Une demande ou un brouillon existe déjà pour ce compte." } });
    return;
  }
  if (db.code === "P0002") {
    res.status(404).json({ error: { code: "REGISTRATION_DRAFT_NOT_FOUND", message: "Le brouillon est introuvable." } });
    return;
  }
  if (db.code === "P0001") {
    const pending = db.message === "REGISTRATION_ALREADY_SUBMITTED";
    res.status(409).json({ error: {
      code: pending ? "REGISTRATION_ALREADY_SUBMITTED" : (db.message ?? "REGISTRATION_DRAFT_NOT_EDITABLE"),
      message: pending ? "Une demande d’organisation est déjà en cours pour ce compte." : "Ce brouillon ne peut plus être modifié.",
    } });
    return;
  }
  if (db.code === "22023") {
    const unsupportedCurrency = db.message === "UNSUPPORTED_CURRENCY";
    res.status(422).json({ error: { code: unsupportedCurrency ? "UNSUPPORTED_CURRENCY" : "VALIDATION_ERROR", message: unsupportedCurrency ? "La devise n’est pas active dans le référentiel Finance." : "Les informations du dossier sont invalides." } });
    return;
  }
  next(error);
}

onboardingRouter.get("/drafts/current", requireUserAuth(), async (req, res, next) => {
  const user = context(req, res);
  if (!user) return;
  try {
    const draft = await onboardingService.getCurrentDraft(user);
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ data: { draft } });
  } catch (error) { sendError(error, res, next); }
});

onboardingRouter.post("/drafts", requireUserAuth(), async (req, res, next) => {
  if (!sameOrigin(req)) {
    res.status(403).json({ error: { code: "ORIGIN_NOT_ALLOWED", message: "Origine de requête non autorisée." } });
    return;
  }
  const user = context(req, res);
  if (!user) return;
  const parsed = registrationPayloadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", details: parsed.error.issues.map((issue) => ({ field: issue.path.join("."), code: issue.code })) } });
    return;
  }
  try {
    const draft = await onboardingService.createOrSaveDraft(user, parsed.data);
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ data: { draft } });
  } catch (error) { sendError(error, res, next); }
});

onboardingRouter.patch("/drafts/:draftId", requireUserAuth(), async (req, res, next) => {
  if (!sameOrigin(req)) {
    res.status(403).json({ error: { code: "ORIGIN_NOT_ALLOWED", message: "Origine de requête non autorisée." } });
    return;
  }
  const user = context(req, res);
  if (!user) return;
  const id = uuidSchema.safeParse(req.params["draftId"]);
  const parsed = registrationPayloadSchema.safeParse(req.body);
  if (!id.success || !parsed.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Référence ou contenu du brouillon invalide." } });
    return;
  }
  try {
    const draft = await onboardingService.updateDraft(user, id.data, parsed.data);
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ data: { draft } });
  } catch (error) { sendError(error, res, next); }
});

onboardingRouter.get("/drafts/:draftId", requireUserAuth(), async (req, res, next) => {
  const user = context(req, res);
  if (!user) return;
  const id = uuidSchema.safeParse(req.params["draftId"]);
  if (!id.success) {
    res.status(404).json({ error: { code: "REGISTRATION_DRAFT_NOT_FOUND" } });
    return;
  }
  try {
    const draft = await onboardingService.getDraft(user, id.data);
    res.setHeader("Cache-Control", "no-store");
    if (!draft) {
      res.status(404).json({ error: { code: "REGISTRATION_DRAFT_NOT_FOUND", message: "Le brouillon est introuvable." } });
      return;
    }
    res.status(200).json({ data: { draft } });
  } catch (error) { sendError(error, res, next); }
});

onboardingRouter.post("/drafts/:draftId/submit", requireUserAuth(), async (req, res, next) => {
  if (!sameOrigin(req)) {
    res.status(403).json({ error: { code: "ORIGIN_NOT_ALLOWED", message: "Origine de requête non autorisée." } });
    return;
  }
  const user = context(req, res);
  if (!user) return;
  const id = uuidSchema.safeParse(req.params["draftId"]);
  const consent = registrationConsentSchema.safeParse(req.body);
  if (!id.success || !consent.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Les consentements et la référence du brouillon sont obligatoires." } });
    return;
  }
  try {
    const request = await onboardingService.submitDraft(
      user, id.data, consent.data.acceptedTermsVersion, consent.data.acceptedPrivacyVersion,
    );
    res.setHeader("Cache-Control", "no-store");
    res.status(202).json({ data: { request } });
  } catch (error) { sendError(error, res, next); }
});

onboardingRouter.get("/requests", requireUserAuth(), async (req, res, next) => {
  const user = context(req, res);
  if (!user) return;
  try {
    const requests = await onboardingService.listMine(user);
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ data: { requests } });
  } catch (error) { sendError(error, res, next); }
});
