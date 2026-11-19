import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { requireUserAuth } from "../../../middleware/require-user-auth.js";
import { platformAdminAccessService, PlatformAdminAccessError } from "../services/platform-admin-access.service.js";
import { listPlatformTaxRules } from "../../tax/application/list-platform-tax-rules.use-case.js";
import { listPlatformTaxJurisdictions } from "../../tax/application/list-platform-tax-jurisdictions.use-case.js";
import { createGlobalTaxRuleDraft } from "../../tax/application/create-global-tax-rule-draft.use-case.js";
import { globalTaxRuleDraftSchema } from "../../tax/validators/tax-rule.schema.js";
import { submitGlobalTaxRule } from "../../tax/application/submit-global-tax-rule.use-case.js";
import { reviewGlobalTaxRule } from "../../tax/application/review-global-tax-rule.use-case.js";
import { listPlatformTaxApprovals } from "../../tax/application/list-platform-tax-approvals.use-case.js";
import { managePlatformTaxJurisdiction } from "../../tax/application/manage-platform-tax-jurisdiction.use-case.js";
import { managePlatformTaxDelegations } from "../../tax/application/manage-platform-tax-delegations.use-case.js";

export const platformTaxAdminRouter = Router();

const querySchema = z.object({
  taxType: z.enum(["VAT", "GST", "SALES_TAX", "EXCISE", "WITHHOLDING", "CUSTOMS_DUTY", "IMPORT_TAX", "ENVIRONMENTAL", "STAMP_DUTY", "OTHER"]).optional(),
  status: z.enum(["DRAFT", "ACTIVE", "RETIRED"]).optional(),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
const createDraftBodySchema = z.object({
  rule: globalTaxRuleDraftSchema,
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

function sendTaxAdminError(error: unknown, res: Response): boolean {
  if (error instanceof PlatformAdminAccessError) {
    res.status(error.status).json({ error: { code: error.code, message: error.message } });
    return true;
  }
  const databaseError = error as { code?: string; message?: string };
  const message = databaseError.message ?? "";
  const known: Record<string, { status: number; message: string }> = {
    PLATFORM_OPERATOR_REQUIRED: { status: 403, message: "Accès administrateur de plateforme requis." },
    INVALID_GLOBAL_TAX_RULE_DRAFT: { status: 422, message: "Les données de la règle fiscale sont invalides." },
    JURISDICTION_NOT_ACTIVE: { status: 409, message: "La juridiction sélectionnée n’est pas active." },
    GLOBAL_DRAFT_RULE_NOT_FOUND: { status: 404, message: "Le brouillon fiscal global est introuvable ou n’est plus modifiable." },
    TAX_RULE_APPROVAL_NOT_PENDING: { status: 409, message: "Cette demande de validation n’est plus en attente." },
    GLOBAL_TAX_RULE_VERSION_CHANGED: { status: 409, message: "La version de la règle a changé. Rechargez le dossier." },
    SELF_REVIEW_NOT_ALLOWED: { status: 403, message: "L’auteur d’une soumission ne peut pas approuver sa propre règle." },
    TAX_RULE_REVIEW_REQUIRED: { status: 403, message: "Vous ne disposez pas du droit de revue pour cette juridiction." },
    INVALID_TAX_RULE_DECISION: { status: 422, message: "La décision ou le motif de revue est invalide." },
    JURISDICTION_MANAGE_REQUIRED: { status: 403, message: "Vous ne disposez pas du droit de gestion de cette juridiction." },
    INVALID_TAX_JURISDICTION: { status: 422, message: "Les informations de la juridiction sont invalides." },
    JURISDICTION_LEVEL_NOT_CONFIGURED: { status: 422, message: "Le niveau de juridiction n’est pas configuré pour ce pays." },
    INVALID_JURISDICTION_PARENT: { status: 422, message: "La juridiction parente est invalide." },
    JURISDICTION_PARENT_LEVEL_MISMATCH: { status: 422, message: "Le niveau de la juridiction parente ne correspond pas à la hiérarchie configurée." },
    JURISDICTION_HIERARCHY_CYCLE: { status: 422, message: "Cette modification créerait une boucle dans la hiérarchie." },
    JURISDICTION_PARENT_REQUIRED: { status: 422, message: "Une juridiction parente est obligatoire pour ce niveau." },
    JURISDICTION_NOT_FOUND: { status: 404, message: "La juridiction est introuvable." },
    INVALID_JURISDICTION_LEVEL: { status: 422, message: "La définition du niveau de juridiction est invalide." },
    PARENT_JURISDICTION_LEVEL_NOT_FOUND: { status: 422, message: "Le niveau parent est introuvable ou inactif." },
    JURISDICTION_LEVEL_CYCLE: { status: 422, message: "Cette configuration créerait une boucle de niveaux." },
    INVALID_TAX_DELEGATION: { status: 422, message: "La portée, les permissions ou la période de délégation sont invalides." },
    SELF_DELEGATION_NOT_ALLOWED: { status: 403, message: "Un opérateur ne peut pas se déléguer ses propres permissions." },
    REVOCATION_REASON_REQUIRED: { status: 422, message: "Un motif de révocation de 10 à 1000 caractères est obligatoire." },
  };
  const mapped = known[message];
  if (mapped) {
    res.status(mapped.status).json({ error: { code: message, message: mapped.message } });
    return true;
  }
  return false;
}

platformTaxAdminRouter.get("/tax/jurisdictions", requireUserAuth(), async (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  const identity = req.financeUser;
  try {
    await platformAdminAccessService.assertActiveOperator(identity);
    if (!identity) {
      res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Une session utilisateur valide est requise." } });
      return;
    }
    const data = await listPlatformTaxJurisdictions.execute(identity.issuer, identity.id);
    res.status(200).json({ data });
  } catch (error) {
    if (!sendTaxAdminError(error, res)) next(error);
  }
});

platformTaxAdminRouter.get("/tax/rules", requireUserAuth(), async (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    await platformAdminAccessService.assertActiveOperator(req.financeUser);
  } catch (error) {
    if (!sendTaxAdminError(error, res)) next(error);
    return;
  }

  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Les filtres fiscaux sont invalides." } });
    return;
  }
  try {
    const query = {
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
      ...(parsed.data.taxType !== undefined ? { taxType: parsed.data.taxType } : {}),
      ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
      ...(parsed.data.search !== undefined ? { search: parsed.data.search } : {}),
    };
    const data = await listPlatformTaxRules.execute(query);
    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
});

platformTaxAdminRouter.post("/tax/rules", requireUserAuth(), async (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  if (!sameOrigin(req)) {
    res.status(403).json({ error: { code: "ORIGIN_NOT_ALLOWED", message: "Origine de requête non autorisée." } });
    return;
  }
  const identity = req.financeUser;
  try {
    await platformAdminAccessService.assertActiveOperator(identity);
  } catch (error) {
    if (!sendTaxAdminError(error, res)) next(error);
    return;
  }
  if (!identity) {
    res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Une session utilisateur valide est requise." } });
    return;
  }
  const parsed = createDraftBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "La règle fiscale ou le motif fourni est invalide." } });
    return;
  }
  try {
    const id = await createGlobalTaxRuleDraft.execute({
      actorIssuer: identity.issuer,
      actorSubject: identity.id,
      rule: parsed.data.rule,
      reason: parsed.data.reason,
      correlationId: String(res.locals["correlationId"] ?? "unknown"),
    });
    res.status(201).json({ data: { id, status: "DRAFT", scope: "GLOBAL" } });
  } catch (error) {
    if (!sendTaxAdminError(error, res)) next(error);
  }
});


const approvalQuerySchema = z.object({
  status: z.enum(["PENDING_REVIEW", "APPROVED", "REJECTED", "CANCELLED"]).optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
const jurisdictionBodySchema = z.object({
  id: z.string().uuid().nullable().optional(),
  code: z.string().trim().min(2).max(80).regex(/^[A-Z0-9][A-Z0-9_.:-]+$/),
  countryCode: z.string().regex(/^[A-Z]{2}$/),
  name: z.string().trim().min(1).max(160),
  levelCode: z.string().trim().regex(/^[A-Z][A-Z0-9_]{1,39}$/),
  parentId: z.string().uuid().nullable().default(null),
  isActive: z.boolean().default(true),
  reason: z.string().trim().min(10).max(1000),
}).strict();
const jurisdictionLevelBodySchema = z.object({
  countryCode: z.string().regex(/^[A-Z]{2}$/),
  levelCode: z.string().trim().regex(/^[A-Z][A-Z0-9_]{1,39}$/),
  label: z.string().trim().min(1).max(100),
  parentLevelCode: z.string().trim().regex(/^[A-Z][A-Z0-9_]{1,39}$/).nullable().default(null),
  sortOrder: z.number().int().min(0).max(10000).default(0),
  isRequired: z.boolean().default(true),
  isActive: z.boolean().default(true),
  reason: z.string().trim().min(10).max(1000),
}).strict();
const reviewBodySchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  reason: z.string().trim().max(1000).default(""),
}).strict().superRefine((value, context) => {
  if (value.decision === "REJECT" && value.reason.length < 10) {
    context.addIssue({ code: "custom", path: ["reason"], message: "Un motif de rejet de 10 à 1000 caractères est obligatoire." });
  }
});
const uuidSchema = z.string().uuid();

platformTaxAdminRouter.get("/tax/approvals", requireUserAuth(), async (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  try { await platformAdminAccessService.assertActiveOperator(req.financeUser); }
  catch (error) { if (!sendTaxAdminError(error, res)) next(error); return; }
  const parsed = approvalQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Les filtres de validation sont invalides." } });
    return;
  }
  try {
    const query = {
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
      ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
    };
    const data = await listPlatformTaxApprovals.execute(query);
    res.status(200).json({ data });
  } catch (error) { next(error); }
});

platformTaxAdminRouter.post("/tax/rules/:ruleId/submit", requireUserAuth(), async (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  if (!sameOrigin(req)) {
    res.status(403).json({ error: { code: "ORIGIN_NOT_ALLOWED", message: "Origine de requête non autorisée." } });
    return;
  }
  try { await platformAdminAccessService.assertActiveOperator(req.financeUser); }
  catch (error) { if (!sendTaxAdminError(error, res)) next(error); return; }
  const ruleId = uuidSchema.safeParse(req.params["ruleId"]);
  if (!ruleId.success) {
    res.status(400).json({ error: { code: "INVALID_RULE_ID", message: "Identifiant de règle invalide." } });
    return;
  }
  const identity = req.financeUser!;
  try {
    const approvalId = await submitGlobalTaxRule.execute({
      ruleId: ruleId.data, actorIssuer: identity.issuer, actorSubject: identity.id,
      correlationId: String(res.locals["correlationId"] ?? "unknown"),
    });
    res.status(201).json({ data: { approvalId, ruleId: ruleId.data, status: "PENDING_REVIEW" } });
  } catch (error) { if (!sendTaxAdminError(error, res)) next(error); }
});

platformTaxAdminRouter.post("/tax/approvals/:approvalId/review", requireUserAuth(), async (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  if (!sameOrigin(req)) {
    res.status(403).json({ error: { code: "ORIGIN_NOT_ALLOWED", message: "Origine de requête non autorisée." } });
    return;
  }
  try { await platformAdminAccessService.assertActiveOperator(req.financeUser); }
  catch (error) { if (!sendTaxAdminError(error, res)) next(error); return; }
  const approvalId = uuidSchema.safeParse(req.params["approvalId"]);
  const body = reviewBodySchema.safeParse(req.body);
  if (!approvalId.success || !body.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "La décision ou le motif est invalide." } });
    return;
  }
  const identity = req.financeUser!;
  try {
    const data = await reviewGlobalTaxRule.execute({
      approvalId: approvalId.data, decision: body.data.decision, reason: body.data.reason,
      actorIssuer: identity.issuer, actorSubject: identity.id,
      correlationId: String(res.locals["correlationId"] ?? "unknown"),
    });
    res.status(200).json({ data });
  } catch (error) { if (!sendTaxAdminError(error, res)) next(error); }
});

platformTaxAdminRouter.get("/tax/jurisdiction-levels", requireUserAuth(), async (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  try { await platformAdminAccessService.assertActiveOperator(req.financeUser); }
  catch (error) { if (!sendTaxAdminError(error, res)) next(error); return; }
  const countryCode = z.string().regex(/^[A-Z]{2}$/).safeParse(req.query["countryCode"]);
  if (!countryCode.success) {
    res.status(400).json({ error: { code: "INVALID_COUNTRY_CODE", message: "Code pays ISO-2 obligatoire." } });
    return;
  }
  try {
    const items = await managePlatformTaxJurisdiction.listLevels(countryCode.data);
    res.status(200).json({ data: { items, countryCode: countryCode.data } });
  } catch (error) { next(error); }
});

platformTaxAdminRouter.post("/tax/jurisdictions", requireUserAuth(), async (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  if (!sameOrigin(req)) {
    res.status(403).json({ error: { code: "ORIGIN_NOT_ALLOWED", message: "Origine de requête non autorisée." } });
    return;
  }
  try { await platformAdminAccessService.assertActiveOperator(req.financeUser); }
  catch (error) { if (!sendTaxAdminError(error, res)) next(error); return; }
  const body = jurisdictionBodySchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Les informations de juridiction sont invalides." } });
    return;
  }
  const identity = req.financeUser!;
  try {
    const id = await managePlatformTaxJurisdiction.upsert({
      id: body.data.id ?? null, code: body.data.code, countryCode: body.data.countryCode,
      name: body.data.name, levelCode: body.data.levelCode, parentId: body.data.parentId,
      isActive: body.data.isActive, actorIssuer: identity.issuer, actorSubject: identity.id,
      reason: body.data.reason, correlationId: String(res.locals["correlationId"] ?? "unknown"),
    });
    res.status(body.data.id ? 200 : 201).json({ data: { id, isActive: body.data.isActive } });
  } catch (error) { if (!sendTaxAdminError(error, res)) next(error); }
});

platformTaxAdminRouter.post("/tax/jurisdiction-levels", requireUserAuth(), async (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  if (!sameOrigin(req)) {
    res.status(403).json({ error: { code: "ORIGIN_NOT_ALLOWED", message: "Origine de requête non autorisée." } });
    return;
  }
  try { await platformAdminAccessService.assertActiveOperator(req.financeUser); }
  catch (error) { if (!sendTaxAdminError(error, res)) next(error); return; }
  const body = jurisdictionLevelBodySchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "La définition du niveau est invalide." } });
    return;
  }
  const identity = req.financeUser!;
  try {
    const id = await managePlatformTaxJurisdiction.upsertLevel({
      ...body.data, actorIssuer: identity.issuer, actorSubject: identity.id,
      correlationId: String(res.locals["correlationId"] ?? "unknown"),
    });
    res.status(200).json({ data: { id, countryCode: body.data.countryCode, levelCode: body.data.levelCode } });
  } catch (error) { if (!sendTaxAdminError(error, res)) next(error); }
});

platformTaxAdminRouter.get("/tax/audit", requireUserAuth(), async (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  try { await platformAdminAccessService.assertActiveOperator(req.financeUser); }
  catch (error) { if (!sendTaxAdminError(error, res)) next(error); return; }
  const parsed = z.object({
    page: z.coerce.number().int().min(1).max(10000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  }).safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Les paramètres d’historique sont invalides." } });
    return;
  }
  try {
    const result = await managePlatformTaxJurisdiction.listAuditEvents(parsed.data.page, parsed.data.pageSize);
    res.status(200).json({ data: { items: result.rows, page: parsed.data.page, pageSize: parsed.data.pageSize, hasMore: result.hasMore } });
  } catch (error) { next(error); }
});


const delegationBodySchema = z.object({
  identityIssuer: z.string().trim().min(1).max(500),
  identitySubject: z.string().trim().min(1).max(500),
  jurisdictionId: z.string().uuid().nullable().default(null),
  countryCode: z.string().regex(/^[A-Z]{2}$/).nullable().default(null),
  permissions: z.array(z.enum(["ASSIGNMENT_REVIEW", "EVIDENCE_REVIEW", "RULE_REVIEW", "JURISDICTION_MANAGE"])).min(1).max(4),
  validFrom: z.iso.datetime(),
  validTo: z.iso.datetime().nullable().default(null),
  reason: z.string().trim().min(10).max(1000),
}).strict().superRefine((value, context) => {
  if ((value.jurisdictionId === null) === (value.countryCode === null)) {
    context.addIssue({ code: "custom", path: ["jurisdictionId"], message: "Choisir une juridiction précise ou un pays, mais pas les deux." });
  }
  if (value.validTo && value.validTo <= value.validFrom) {
    context.addIssue({ code: "custom", path: ["validTo"], message: "La fin de validité doit être postérieure au début." });
  }
});
const delegationRevokeSchema = z.object({ reason: z.string().trim().min(10).max(1000) }).strict();

platformTaxAdminRouter.get("/tax/delegations", requireUserAuth(), async (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  const identity = req.financeUser;
  try {
    await platformAdminAccessService.assertActiveOperator(identity);
    if (!identity) {
      res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Une session utilisateur valide est requise." } });
      return;
    }
    const items = await managePlatformTaxDelegations.list(identity.issuer, identity.id);
    res.status(200).json({ data: { items, scope: "GLOBAL" } });
  } catch (error) { if (!sendTaxAdminError(error, res)) next(error); }
});

platformTaxAdminRouter.post("/tax/delegations", requireUserAuth(), async (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  if (!sameOrigin(req)) {
    res.status(403).json({ error: { code: "ORIGIN_NOT_ALLOWED", message: "Origine de requête non autorisée." } });
    return;
  }
  const identity = req.financeUser;
  try { await platformAdminAccessService.assertActiveOperator(identity); }
  catch (error) { if (!sendTaxAdminError(error, res)) next(error); return; }
  if (!identity) {
    res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Une session utilisateur valide est requise." } });
    return;
  }
  const body = delegationBodySchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "La délégation ou sa portée est invalide." } });
    return;
  }
  try {
    const id = await managePlatformTaxDelegations.create({
      ...body.data,
      actorIssuer: identity.issuer,
      actorSubject: identity.id,
      correlationId: String(res.locals["correlationId"] ?? "unknown"),
    });
    res.status(201).json({ data: { id, status: "ACTIVE" } });
  } catch (error) { if (!sendTaxAdminError(error, res)) next(error); }
});

platformTaxAdminRouter.post("/tax/delegations/:delegationId/revoke", requireUserAuth(), async (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  if (!sameOrigin(req)) {
    res.status(403).json({ error: { code: "ORIGIN_NOT_ALLOWED", message: "Origine de requête non autorisée." } });
    return;
  }
  const identity = req.financeUser;
  try { await platformAdminAccessService.assertActiveOperator(identity); }
  catch (error) { if (!sendTaxAdminError(error, res)) next(error); return; }
  if (!identity) {
    res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Une session utilisateur valide est requise." } });
    return;
  }
  const delegationId = uuidSchema.safeParse(req.params["delegationId"]);
  const body = delegationRevokeSchema.safeParse(req.body);
  if (!delegationId.success || !body.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "L’identifiant ou le motif de révocation est invalide." } });
    return;
  }
  try {
    const revoked = await managePlatformTaxDelegations.revoke({
      delegationId: delegationId.data, reason: body.data.reason,
      actorIssuer: identity.issuer, actorSubject: identity.id,
      correlationId: String(res.locals["correlationId"] ?? "unknown"),
    });
    if (!revoked) {
      res.status(409).json({ error: { code: "TAX_DELEGATION_NOT_ACTIVE", message: "Cette délégation n’est plus active." } });
      return;
    }
    res.status(200).json({ data: { id: delegationId.data, status: "REVOKED" } });
  } catch (error) { if (!sendTaxAdminError(error, res)) next(error); }
});
