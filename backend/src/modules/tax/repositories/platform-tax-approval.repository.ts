import { pool } from "../../../db/pool.js";

export interface GlobalTaxApprovalQuery {
  readonly status?: "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "CANCELLED";
  readonly page: number;
  readonly pageSize: number;
}

export const platformTaxApprovalRepository = {
  async submit(ruleId: string, actorIssuer: string, actorSubject: string, correlationId: string): Promise<string> {
    const result = await pool.query<{ approval_id: string }>(
      "SELECT public.finance_submit_global_tax_rule_for_approval($1, $2, $3, $4) AS approval_id",
      [ruleId, actorIssuer, actorSubject, correlationId],
    );
    const id = result.rows[0]?.approval_id;
    if (!id) throw new Error("GLOBAL_TAX_RULE_SUBMISSION_FAILED");
    return id;
  },

  async review(input: {
    approvalId: string;
    decision: "APPROVE" | "REJECT";
    reason: string;
    actorIssuer: string;
    actorSubject: string;
    correlationId: string;
  }): Promise<{ approval_id: string; rule_id: string; status: string }> {
    const result = await pool.query<{ approval_id: string; rule_id: string; status: string }>(
      `SELECT approval_id, rule_id, status
         FROM public.finance_review_global_tax_rule($1, $2, $3, $4, $5, $6)`,
      [input.approvalId, input.decision, input.reason, input.actorIssuer, input.actorSubject, input.correlationId],
    );
    const row = result.rows[0];
    if (!row) throw new Error("GLOBAL_TAX_RULE_REVIEW_FAILED");
    return row;
  },

  async list(query: GlobalTaxApprovalQuery, actorIssuer: string, actorSubject: string) {
    const values: (string | number)[] = [];
    const conditions = ["a.tenant_id IS NULL", "public.finance_tax_actor_can($1, $2, 'RULE_REVIEW', r.jurisdiction_id)"];
    values.push(actorIssuer, actorSubject);
    if (query.status) {
      values.push(query.status);
      conditions.push(`a.status = $${values.length}`);
    }
    values.push(query.pageSize + 1);
    const limitPosition = values.length;
    values.push((query.page - 1) * query.pageSize);
    const offsetPosition = values.length;
    const result = await pool.query(
      `SELECT a.id AS approval_id, a.tax_rule_id AS rule_id, a.rule_version AS version,
              a.status, a.submitted_by_issuer, a.submitted_by_subject,
              a.reviewed_by_issuer, a.reviewed_by_subject, a.reviewed_at,
              a.decision_reason, a.created_at AS submitted_at,
              r.jurisdiction_id, j.code AS jurisdiction_code, j.country_code,
              r.rule_code, r.name, r.tax_type, r.treatment,
              r.rate_percent::text AS rate_percent, r.price_mode, r.applies_to,
              r.accounting_treatment, r.valid_from::text AS valid_from,
              r.valid_to::text AS valid_to, r.source_reference, r.source_url
         FROM public.finance_tax_rule_approvals a
         JOIN public.finance_tax_rules r
           ON r.id = a.tax_rule_id AND r.tenant_id IS NULL AND r.version = a.rule_version
         JOIN public.finance_tax_jurisdictions j ON j.id = r.jurisdiction_id
        WHERE ${conditions.join(" AND ")}
        ORDER BY CASE WHEN a.status = 'PENDING_REVIEW' THEN 0 ELSE 1 END,
                 a.created_at DESC, a.id DESC
        LIMIT $${limitPosition} OFFSET $${offsetPosition}`,
      values,
    );
    const hasMore = result.rows.length > query.pageSize;
    return { rows: hasMore ? result.rows.slice(0, query.pageSize) : result.rows, hasMore };
  },
};
