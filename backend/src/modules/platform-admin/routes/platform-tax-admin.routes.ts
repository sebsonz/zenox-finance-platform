import { Router } from "express";
import { z } from "zod";
import { requireUserAuth } from "../../../middleware/require-user-auth.js";
import { platformAdminAccessService, PlatformAdminAccessError } from "../services/platform-admin-access.service.js";
import { listPlatformTaxRules } from "../../tax/application/list-platform-tax-rules.use-case.js";
import { listPlatformTaxJurisdictions } from "../../tax/application/list-platform-tax-jurisdictions.use-case.js";

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
