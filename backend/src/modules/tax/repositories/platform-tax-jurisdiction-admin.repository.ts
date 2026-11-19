import { pool } from "../../../db/pool.js";

export interface TaxJurisdictionInput {
  id: string | null;
  code: string;
  countryCode: string;
  name: string;
  levelCode: string;
  parentId: string | null;
  isActive: boolean;
  actorIssuer: string;
  actorSubject: string;
  reason: string;
  correlationId: string;
}

export interface TaxJurisdictionLevelInput {
  countryCode: string;
  levelCode: string;
  label: string;
  parentLevelCode: string | null;
  sortOrder: number;
  isRequired: boolean;
  isActive: boolean;
  actorIssuer: string;
  actorSubject: string;
  reason: string;
  correlationId: string;
}

export const platformTaxJurisdictionAdminRepository = {
  async upsert(input: TaxJurisdictionInput): Promise<string> {
    const result = await pool.query<{ id: string }>(
      "SELECT public.finance_platform_upsert_tax_jurisdiction($1,$2,$3::char(2),$4,$5,$6,$7,$8,$9,$10,$11) AS id",
      [input.id, input.code, input.countryCode, input.name, input.levelCode, input.parentId,
        input.isActive, input.actorIssuer, input.actorSubject, input.reason, input.correlationId],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error("TAX_JURISDICTION_UPSERT_FAILED");
    return id;
  },

  async upsertLevel(input: TaxJurisdictionLevelInput): Promise<string> {
    const result = await pool.query<{ id: string }>(
      "SELECT public.finance_platform_upsert_tax_jurisdiction_level($1::char(2),$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) AS id",
      [input.countryCode, input.levelCode, input.label, input.parentLevelCode, input.sortOrder,
        input.isRequired, input.isActive, input.actorIssuer, input.actorSubject, input.reason, input.correlationId],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error("TAX_JURISDICTION_LEVEL_UPSERT_FAILED");
    return id;
  },

  async listLevels(countryCode: string) {
    const result = await pool.query(
      `SELECT id, country_code, level_code, label, parent_level_code,
              sort_order, is_required, is_active, created_at, updated_at
         FROM public.finance_tax_jurisdiction_levels
        WHERE country_code = $1
        ORDER BY sort_order, level_code`,
      [countryCode],
    );
    return result.rows;
  },

  async listAuditEvents(page: number, pageSize: number) {
    const values = [pageSize + 1, (page - 1) * pageSize];
    const result = await pool.query(
      `SELECT id, actor_issuer, actor_subject, action, resource_type,
              resource_id, correlation_id, reason, safe_metadata, created_at
         FROM public.finance_platform_tax_audit_events
        WHERE action LIKE 'GLOBAL_TAX_RULE_%' OR action LIKE 'TAX_JURISDICTION%' OR action LIKE 'TAX_DELEGATION%'
        ORDER BY created_at DESC, id DESC
        LIMIT $1 OFFSET $2`,
      values,
    );
    const hasMore = result.rows.length > pageSize;
    return { rows: hasMore ? result.rows.slice(0, pageSize) : result.rows, hasMore };
  },
};
