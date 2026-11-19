import { pool } from "../../../db/pool.js";
import type { GlobalTaxRuleDraftInput } from "../validators/tax-rule.schema.js";

export interface PlatformTaxRuleQuery {
  readonly taxType?: string;
  readonly status?: string;
  readonly search?: string;
  readonly page: number;
  readonly pageSize: number;
}
export const platformTaxRuleRepository = {
  async createGlobalDraft(input: {
    actorIssuer: string;
    actorSubject: string;
    rule: GlobalTaxRuleDraftInput;
    reason: string;
    correlationId: string;
  }): Promise<string> {
    const result = await pool.query<{ id: string }>(
      "SELECT public.finance_platform_create_global_tax_rule_draft($1, $2, $3::jsonb, $4, $5) AS id",
      [
        input.actorIssuer,
        input.actorSubject,
        JSON.stringify(input.rule),
        input.reason,
        input.correlationId,
      ],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error("GLOBAL_TAX_RULE_DRAFT_CREATION_FAILED");
    return id;
  },

  async listGlobal(query: PlatformTaxRuleQuery) {
    const values: (string | number)[] = [];
    const conditions = ["tenant_id IS NULL"];
    if (query.taxType) { values.push(query.taxType); conditions.push(`tax_type = $${values.length}`); }
    if (query.status) { values.push(query.status); conditions.push(`status = $${values.length}`); }
    if (query.search) { values.push(`%${query.search}%`); conditions.push(`(rule_code ILIKE $${values.length} OR name ILIKE $${values.length})`); }
    values.push(query.pageSize + 1);
    const limitPosition = values.length;
    values.push((query.page - 1) * query.pageSize);
    const offsetPosition = values.length;
    const result = await pool.query(
      `SELECT id, jurisdiction_id, rule_code, name, tax_type, treatment,
              rate_percent::text AS rate_percent, price_mode, priority, is_compound,
              applies_to, source_reference, source_url, version,
              accounting_treatment, applicability_conditions,
              source_verified_at::text AS source_verified_at, reviewed_by,
              valid_from::text AS valid_from, valid_to::text AS valid_to,
              status, created_at, updated_at
         FROM public.finance_tax_rules
        WHERE ${conditions.join(" AND ")}
        ORDER BY jurisdiction_id, rule_code, version DESC
        LIMIT $${limitPosition} OFFSET $${offsetPosition}`,
      values,
    );
    const hasMore = result.rows.length > query.pageSize;
    return { rows: hasMore ? result.rows.slice(0, query.pageSize) : result.rows, hasMore };
  },
};
