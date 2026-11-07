import { Router } from "express";
import { z } from "zod";
import { requireUserAuth } from "../../../middleware/require-user-auth.js";
import { pool } from "../../../db/pool.js";

export const platformTaxAdminRouter = Router();

const querySchema = z.object({
  taxType: z.enum(["VAT", "GST", "SALES_TAX", "EXCISE", "WITHHOLDING", "CUSTOMS_DUTY", "IMPORT_TAX", "ENVIRONMENTAL", "STAMP_DUTY", "OTHER"]).optional(),
  status: z.enum(["DRAFT", "ACTIVE", "RETIRED"]).optional(),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

platformTaxAdminRouter.get("/tax/rules", requireUserAuth(), async (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  const identity = req.financeUser;
  if (!identity) {
    res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Une session utilisateur valide est requise." } });
    return;
  }
  if (!identity.emailConfirmedAt) {
    res.status(403).json({ error: { code: "EMAIL_CONFIRMATION_REQUIRED", message: "Confirmez votre adresse e-mail." } });
    return;
  }

  try {
    const operator = await pool.query<{ is_active: boolean }>(
      "SELECT public.finance_is_active_platform_operator($1, $2) AS is_active",
      [identity.issuer, identity.id],
    );
    if (operator.rows[0]?.is_active !== true) {
      res.status(403).json({ error: { code: "PLATFORM_OPERATOR_REQUIRED", message: "Une autorisation d’administration de la plateforme est requise." } });
      return;
    }

    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Les filtres fiscaux sont invalides." } });
      return;
    }
    const { taxType, status, search, page, pageSize } = parsed.data;
    const values: (string | number)[] = [];
    const conditions = ["r.tenant_id IS NULL"];
    if (taxType) {
      values.push(taxType);
      conditions.push(`r.tax_type = $${values.length}`);
    }
    if (status) {
      values.push(status);
      conditions.push(`r.status = $${values.length}`);
    }
    if (search) {
      values.push(`%${search}%`);
      conditions.push(`(r.rule_code ILIKE $${values.length} OR r.name ILIKE $${values.length})`);
    }
    values.push(pageSize + 1);
    const limitPosition = values.length;
    values.push((page - 1) * pageSize);
    const offsetPosition = values.length;

    const result = await pool.query<{
      id: string; jurisdiction_id: string; rule_code: string; name: string;
      tax_type: string; treatment: string; rate_percent: string; price_mode: string;
      priority: number; is_compound: boolean; applies_to: string; source_reference: string | null;
      source_url: string | null; version: number; valid_from: string; valid_to: string | null;
      status: "DRAFT" | "ACTIVE" | "RETIRED"; created_at: Date; updated_at: Date;
    }>(
      `SELECT r.id, r.jurisdiction_id, r.rule_code, r.name, r.tax_type, r.treatment,
              r.rate_percent::text AS rate_percent, r.price_mode, r.priority, r.is_compound,
              r.applies_to, r.source_reference, r.source_url, r.version,
              r.valid_from::text AS valid_from, r.valid_to::text AS valid_to,
              r.status, r.created_at, r.updated_at
         FROM public.finance_tax_rules r
        WHERE ${conditions.join(" AND ")}
        ORDER BY r.jurisdiction_id, r.rule_code, r.version DESC
        LIMIT $${limitPosition} OFFSET $${offsetPosition}`,
      values,
    );
    const hasMore = result.rows.length > pageSize;
    const items = (hasMore ? result.rows.slice(0, pageSize) : result.rows).map((row) => ({
      id: row.id, jurisdictionId: row.jurisdiction_id, ruleCode: row.rule_code,
      name: row.name, taxType: row.tax_type, treatment: row.treatment,
      ratePercent: row.rate_percent, priceMode: row.price_mode, priority: row.priority,
      isCompound: row.is_compound, appliesTo: row.applies_to,
      sourceReference: row.source_reference, sourceUrl: row.source_url,
      version: row.version, validFrom: row.valid_from, validTo: row.valid_to,
      status: row.status, createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }));
    res.status(200).json({ data: { items, page, pageSize, hasMore, scope: "GLOBAL" } });
  } catch (error) {
    next(error);
  }
});
