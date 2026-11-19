import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { requireUserAuth } from "../../../middleware/require-user-auth.js";
import { platformAdminAccessService, PlatformAdminAccessError } from "../services/platform-admin-access.service.js";
import { listPlatformTaxRules } from "../../tax/application/list-platform-tax-rules.use-case.js";
import { listPlatformTaxJurisdictions } from "../../tax/application/list-platform-tax-jurisdictions.use-case.js";
import { createGlobalTaxRuleDraft } from "../../tax/application/create-global-tax-rule-draft.use-case.js";
import { globalTaxRuleDraftSchema } from "../../tax/validators/tax-rule.schema.js";

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
