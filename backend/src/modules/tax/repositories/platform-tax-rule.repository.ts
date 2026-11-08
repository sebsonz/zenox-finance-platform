import { pool } from "../../../db/pool.js";

export interface PlatformTaxRuleQuery {
  readonly taxType?: string;
  readonly status?: string;
  readonly search?: string;
  readonly page: number;
  readonly pageSize: number;
}
export const platformTaxRuleRepository = {
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
