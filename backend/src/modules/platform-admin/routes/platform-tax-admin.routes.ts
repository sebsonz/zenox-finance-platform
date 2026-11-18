import { Router } from "express";
import { z } from "zod";
import { requireUserAuth } from "../../../middleware/require-user-auth.js";
import { platformAdminAccessService, PlatformAdminAccessError } from "../services/platform-admin-access.service.js";
import { listPlatformTaxRules } from "../../tax/application/list-platform-tax-rules.use-case.js";
import { listPlatformTaxJurisdictions } from "../../tax/application/list-platform-tax-jurisdictions.use-case.js";
import { platformTaxWorkflowRepository } from "../../tax/repositories/platform-tax-workflow.repository.js";

export const platformTaxAdminRouter = Router();

const querySchema = z.object({
  taxType: z.enum(["VAT", "GST", "SALES_TAX", "EXCISE", "WITHHOLDING", "CUSTOMS_DUTY", "IMPORT_TAX", "ENVIRONMENTAL", "STAMP_DUTY", "OTHER"]).optional(),
  status: z.enum(["DRAFT", "ACTIVE", "RETIRED"]).optional(),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

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
    if (error instanceof PlatformAdminAccessError) {
      res.status(error.status).json({ error: { code: error.code, message: error.message } });
      return;
    }
    next(error);
  }
});

platformTaxAdminRouter.get("/tax/rules", requireUserAuth(), async (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    await platformAdminAccessService.assertActiveOperator(req.financeUser);
  } catch (error) {
    if (error instanceof PlatformAdminAccessError) {
      res.status(error.status).json({ error: { code: error.code, message: error.message } });
      return;
    }
    next(error);
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


// Tax assignment queue: platform operators and explicitly delegated reviewers.
// Authorization is rechecked inside the SECURITY DEFINER function.
const assignmentQueueSchema = z.object({
  status: z.enum(["PENDING_REVIEW","ACTIVE","SUSPENDED","EXPIRED","REVOKED"]).optional(),
  countryCode: z.string().regex(/^[A-Z]{2}$/).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
}).strict();

const assignmentDecisionSchema = z.object({
  decision: z.enum(["APPROVE","REJECT"]),
  reason: z.string().trim().min(10).max(1000).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.decision === "REJECT" && !value.reason) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["reason"], message: "Une justification est obligatoire pour un rejet." });
  }
});

const jurisdictionSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().trim().regex(/^[A-Z0-9][A-Z0-9_.:-]{1,79}$/),
  countryCode: z.string().regex(/^[A-Z]{2}$/),
  name: z.string().trim().min(1).max(160),
  levelCode: z.string().regex(/^[A-Z][A-Z0-9_]{1,39}$/),
  parentId: z.string().uuid().nullable().optional(),
  isActive: z.boolean(),
  reason: z.string().trim().min(10).max(1000),
}).strict();

const jurisdictionLevelSchema = z.object({
  countryCode: z.string().regex(/^[A-Z]{2}$/),
  levelCode: z.string().regex(/^[A-Z][A-Z0-9_]{1,39}$/),
  label: z.string().trim().min(1).max(100),
  parentLevelCode: z.string().regex(/^[A-Z][A-Z0-9_]{1,39}$/).nullable().optional(),
  sortOrder: z.number().int().min(0).max(10000),
  isRequired: z.boolean(),
  isActive: z.boolean(),
  reason: z.string().trim().min(10).max(1000),
}).strict();

function taxSameOrigin(req: import("express").Request): boolean {
  const origin = req.header("origin");
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    return (parsed.protocol === "https:" || parsed.protocol === "http:") &&
      parsed.host.toLowerCase() === (req.get("host") ?? "").toLowerCase();
  } catch { return false; }
}
function requestIdentity(req: import("express").Request) {
  const identity = req.financeUser;
  if (!identity) return null;
  return { issuer: identity.issuer, subject: identity.id };
}
function taxCorrelation(res: import("express").Response): string {
  return String(res.locals["correlationId"] ?? "unknown");
}
function taxDatabaseError(error: unknown, res: import("express").Response): boolean {
  const db = error as { code?: string; message?: string };
  if (db.code === "42501") {
    res.status(403).json({ error: { code: db.message ?? "TAX_PERMISSION_REQUIRED", message: "Vous n’êtes pas habilité à effectuer cette opération fiscale." } });
    return true;
  }
  if (db.code === "P0002") {
    res.status(404).json({ error: { code: db.message ?? "TAX_RESOURCE_NOT_FOUND", message: "Le dossier fiscal demandé est introuvable ou indisponible." } });
    return true;
  }
  if (db.code === "22023" || db.code === "23514") {
    res.status(422).json({ error: { code: db.message ?? "INVALID_TAX_OPERATION", message: "L’opération fiscale ne respecte pas les contrôles métier." } });
    return true;
  }
  return false;
}

platformTaxAdminRouter.get("/tax/assignments", requireUserAuth(), async (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  const identity = requestIdentity(req);
  const parsed = assignmentQueueSchema.safeParse(req.query);
  if (!identity || !parsed.success) {
    res.status(identity ? 400 : 401).json({ error: { code: identity ? "VALIDATION_ERROR" : "UNAUTHENTICATED", message: "La requête ou la session est invalide." } });
    return;
  }
  try {
    const data = await platformTaxWorkflowRepository.listAssignments({
      issuer: identity.issuer, subject: identity.subject,
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
      ...(parsed.data.countryCode ? { countryCode: parsed.data.countryCode } : {}),
      limit: parsed.data.limit, offset: parsed.data.offset,
    });
    res.status(200).json({ data });
  } catch (error) {
    if (!taxDatabaseError(error,res)) next(error);
  }
});

platformTaxAdminRouter.post("/tax/assignments/:assignmentId/review", requireUserAuth(), async (req, res, next) => {
  if (!taxSameOrigin(req)) {
    res.status(403).json({ error: { code: "ORIGIN_NOT_ALLOWED", message: "Origine de requête non autorisée." } });
    return;
  }
  const identity = requestIdentity(req);
  const assignmentId = z.string().uuid().safeParse(req.params["assignmentId"]);
  const body = assignmentDecisionSchema.safeParse(req.body);
  if (!identity || !assignmentId.success || !body.success) {
    res.status(identity ? 400 : 401).json({ error: { code: identity ? "VALIDATION_ERROR" : "UNAUTHENTICATED", message: "La décision ou la session est invalide." } });
    return;
  }
  if (body.data.decision === "REJECT" && !body.data.reason) {
    res.status(400).json({ error: { code: "REJECTION_REASON_REQUIRED", message: "Une justification est obligatoire." } });
    return;
  }
  try {
    const result = await platformTaxWorkflowRepository.reviewAssignment({
      assignmentId: assignmentId.data, decision: body.data.decision,
      ...(body.data.reason ? { reason: body.data.reason } : {}),
      issuer: identity.issuer, subject: identity.subject, correlationId: taxCorrelation(res),
    });
    res.status(200).json({ data: result });
  } catch (error) {
    if (!taxDatabaseError(error,res)) next(error);
  }
});

platformTaxAdminRouter.put("/tax/jurisdiction-levels", requireUserAuth(), async (req, res, next) => {
  if (!taxSameOrigin(req)) {
    res.status(403).json({ error: { code: "ORIGIN_NOT_ALLOWED", message: "Origine de requête non autorisée." } });
    return;
  }
  const identity = requestIdentity(req);
  const body = jurisdictionLevelSchema.safeParse(req.body);
  if (!identity || !body.success) {
    res.status(identity ? 400 : 401).json({ error: { code: identity ? "VALIDATION_ERROR" : "UNAUTHENTICATED", message: "Le niveau juridictionnel ou la session est invalide." } });
    return;
  }
  try {
    const id = await platformTaxWorkflowRepository.upsertJurisdictionLevel({
      ...body.data, issuer: identity.issuer, subject: identity.subject, correlationId: taxCorrelation(res),
    });
    res.status(200).json({ data: { id } });
  } catch (error) {
    if (!taxDatabaseError(error,res)) next(error);
  }
});

platformTaxAdminRouter.put("/tax/jurisdictions", requireUserAuth(), async (req, res, next) => {
  if (!taxSameOrigin(req)) {
    res.status(403).json({ error: { code: "ORIGIN_NOT_ALLOWED", message: "Origine de requête non autorisée." } });
    return;
  }
  const identity = requestIdentity(req);
  const body = jurisdictionSchema.safeParse(req.body);
  if (!identity || !body.success) {
    res.status(identity ? 400 : 401).json({ error: { code: identity ? "VALIDATION_ERROR" : "UNAUTHENTICATED", message: "La juridiction ou la session est invalide." } });
    return;
  }
  try {
    const id = await platformTaxWorkflowRepository.upsertJurisdiction({
      ...body.data, issuer: identity.issuer, subject: identity.subject, correlationId: taxCorrelation(res),
    });
    res.status(200).json({ data: { id } });
  } catch (error) {
    if (!taxDatabaseError(error,res)) next(error);
  }
});


const delegationSchema = z.object({
  identityIssuer: z.string().trim().min(1).max(500),
  identitySubject: z.string().trim().min(1).max(500),
  jurisdictionId: z.string().uuid().nullable().optional(),
  countryCode: z.string().regex(/^[A-Z]{2}$/).nullable().optional(),
  permissions: z.array(z.enum(["ASSIGNMENT_REVIEW","EVIDENCE_REVIEW","RULE_REVIEW","JURISDICTION_MANAGE"])).min(1).max(4),
  validFrom: z.string().datetime({ offset: true }),
  validTo: z.string().datetime({ offset: true }).nullable().optional(),
  reason: z.string().trim().min(10).max(1000),
}).strict().superRefine((value, ctx) => {
  if ((value.jurisdictionId ?? null) === null && (value.countryCode ?? null) === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["countryCode"], message: "Une juridiction ou un pays doit être sélectionné." });
  }
  if ((value.jurisdictionId ?? null) !== null && (value.countryCode ?? null) !== null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["countryCode"], message: "Choisissez un seul périmètre de délégation." });
  }
  if (value.validTo && value.validTo <= value.validFrom) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["validTo"], message: "La fin doit être postérieure au début." });
  }
});

platformTaxAdminRouter.get("/tax/delegations", requireUserAuth(), async (req,res,next) => {
  try {
    await platformAdminAccessService.assertActiveOperator(req.financeUser);
    const identity = requestIdentity(req);
    if (!identity) return;
    const data = await platformTaxWorkflowRepository.listDelegations(identity.issuer,identity.subject);
    res.setHeader("Cache-Control","no-store");
    res.status(200).json({ data });
  } catch(error) {
    if (error instanceof PlatformAdminAccessError) {
      res.status(error.status).json({ error: { code:error.code,message:error.message } });
      return;
    }
    next(error);
  }
});

platformTaxAdminRouter.post("/tax/delegations", requireUserAuth(), async (req,res,next) => {
  if (!taxSameOrigin(req)) {
    res.status(403).json({ error: { code:"ORIGIN_NOT_ALLOWED",message:"Origine de requête non autorisée." } });
    return;
  }
  try {
    await platformAdminAccessService.assertActiveOperator(req.financeUser);
    const identity = requestIdentity(req);
    const body = delegationSchema.safeParse(req.body);
    if (!identity || !body.success) {
      res.status(identity ? 400 : 401).json({ error: { code:identity ? "VALIDATION_ERROR" : "UNAUTHENTICATED",message:"La délégation ou la session est invalide." } });
      return;
    }
    const id = await platformTaxWorkflowRepository.createDelegation({
      ...body.data,issuer:identity.issuer,subject:identity.subject,correlationId:taxCorrelation(res),
    });
    res.status(201).json({ data:{ id,status:"ACTIVE" } });
  } catch(error) {
    if (error instanceof PlatformAdminAccessError) {
      res.status(error.status).json({ error:{code:error.code,message:error.message} });
      return;
    }
    if (!taxDatabaseError(error,res)) next(error);
  }
});

platformTaxAdminRouter.post("/tax/delegations/:delegationId/revoke", requireUserAuth(), async (req,res,next) => {
  if (!taxSameOrigin(req)) {
    res.status(403).json({ error:{code:"ORIGIN_NOT_ALLOWED",message:"Origine de requête non autorisée."} });
    return;
  }
  try {
    await platformAdminAccessService.assertActiveOperator(req.financeUser);
    const identity = requestIdentity(req);
    const id = z.string().uuid().safeParse(req.params["delegationId"]);
    const body = z.object({ reason:z.string().trim().min(10).max(1000) }).strict().safeParse(req.body);
    if (!identity || !id.success || !body.success) {
      res.status(identity ? 400 : 401).json({ error:{code:identity ? "VALIDATION_ERROR" : "UNAUTHENTICATED",message:"La demande de révocation est invalide."} });
      return;
    }
    const revoked = await platformTaxWorkflowRepository.revokeDelegation({
      delegationId:id.data,reason:body.data.reason,issuer:identity.issuer,
      subject:identity.subject,correlationId:taxCorrelation(res),
    });
    if (!revoked) {
      res.status(404).json({ error:{code:"DELEGATION_NOT_ACTIVE",message:"La délégation est introuvable ou déjà inactive."} });
      return;
    }
    res.status(200).json({ data:{ id:id.data,status:"REVOKED" } });
  } catch(error) {
    if (error instanceof PlatformAdminAccessError) {
      res.status(error.status).json({ error:{code:error.code,message:error.message} });
      return;
    }
    if (!taxDatabaseError(error,res)) next(error);
  }
});
