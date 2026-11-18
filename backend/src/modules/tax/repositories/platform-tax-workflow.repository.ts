import { pool } from "../../../db/pool.js";

export const platformTaxWorkflowRepository = {
  async createGlobalRuleDraft(input: {
    issuer: string; subject: string; rule: Record<string, unknown>; reason: string; correlationId: string;
  }) {
    const result = await pool.query<{ finance_platform_create_global_tax_rule_draft: string }>(
      "SELECT public.finance_platform_create_global_tax_rule_draft($1,$2,$3::jsonb,$4,$5)",
      [input.issuer,input.subject,JSON.stringify(input.rule),input.reason,input.correlationId],
    );
    return result.rows[0]?.finance_platform_create_global_tax_rule_draft;
  },

  async submitGlobalRuleForApproval(ruleId: string, issuer: string, subject: string, correlationId: string) {
    const result = await pool.query<{ finance_submit_global_tax_rule_for_approval: string }>(
      "SELECT public.finance_submit_global_tax_rule_for_approval($1,$2,$3,$4)",
      [ruleId,issuer,subject,correlationId],
    );
    return result.rows[0]?.finance_submit_global_tax_rule_for_approval;
  },

  async reviewGlobalRule(input: {
    approvalId: string; decision: "APPROVE" | "REJECT"; reason?: string;
    issuer: string; subject: string; correlationId: string;
  }) {
    const result = await pool.query(
      "SELECT * FROM public.finance_review_global_tax_rule($1,$2,$3,$4,$5,$6)",
      [input.approvalId,input.decision,input.reason ?? null,input.issuer,input.subject,input.correlationId],
    );
    return result.rows[0];
  },

  async canReviewAssignment(issuer: string, subject: string, assignmentId: string): Promise<boolean> {
    const result = await pool.query<{ allowed: boolean }>(
      `SELECT public.finance_tax_actor_can($1,$2,'ASSIGNMENT_REVIEW',a.jurisdiction_id) AS allowed
         FROM public.finance_tenant_tax_jurisdictions a WHERE a.id=$3`,
      [issuer,subject,assignmentId],
    );
    return result.rows[0]?.allowed === true;
  },

  async canManageJurisdiction(issuer: string, subject: string, jurisdictionId: string): Promise<boolean> {
    const result = await pool.query<{ allowed: boolean }>(
      "SELECT public.finance_tax_actor_can($1,$2,'JURISDICTION_MANAGE',$3) AS allowed",
      [issuer,subject,jurisdictionId],
    );
    return result.rows[0]?.allowed === true;
  },
  async listAssignments(input: {
    issuer: string; subject: string; status?: string; countryCode?: string;
    limit: number; offset: number;
  }) {
    const result = await pool.query(
      `SELECT * FROM public.finance_list_platform_tax_assignments(
        $1,$2,$3,$4,$5,$6
      )`,
      [input.issuer,input.subject,input.status ?? null,input.countryCode ?? null,input.limit,input.offset],
    );
    return result.rows;
  },

  async listEvidence(assignmentId: string, issuer: string, subject: string) {
    const result = await pool.query(
      "SELECT * FROM public.finance_list_tax_assignment_evidence($1,$2,$3)",
      [assignmentId,issuer,subject],
    );
    return result.rows;
  },

  async reviewEvidence(input: {
    evidenceId: string; decision: "VERIFY" | "REJECT"; note?: string;
    issuer: string; subject: string; correlationId: string;
  }) {
    const result = await pool.query<{ finance_review_tax_assignment_evidence: string }>(
      "SELECT public.finance_review_tax_assignment_evidence($1,$2,$3,$4,$5,$6) AS assignment_id",
      [input.evidenceId,input.decision,input.note ?? null,input.issuer,input.subject,input.correlationId],
    );
    return result.rows[0]?.assignment_id;
  },

  async reviewAssignment(input: {
    assignmentId: string; decision: "APPROVE" | "REJECT"; reason?: string;
    issuer: string; subject: string; correlationId: string;
  }) {
    const result = await pool.query(
      `SELECT * FROM public.finance_review_tenant_tax_assignment($1,$2,$3,$4,$5,$6)`,
      [input.assignmentId,input.decision,input.reason ?? null,input.issuer,input.subject,input.correlationId],
    );
    return result.rows[0];
  },

  async upsertJurisdiction(input: {
    id?: string; code: string; countryCode: string; name: string; levelCode: string;
    parentId?: string | null; isActive: boolean; issuer: string; subject: string;
    reason: string; correlationId: string;
  }) {
    const result = await pool.query<{ finance_platform_upsert_tax_jurisdiction: string }>(
      `SELECT public.finance_platform_upsert_tax_jurisdiction(
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11
      )`,
      [input.id ?? null,input.code,input.countryCode,input.name,input.levelCode,
       input.parentId ?? null,input.isActive,input.issuer,input.subject,input.reason,input.correlationId],
    );
    return result.rows[0]?.finance_platform_upsert_tax_jurisdiction;
  },

  async upsertJurisdictionLevel(input: {
    countryCode: string; levelCode: string; label: string; parentLevelCode?: string | null;
    sortOrder: number; isRequired: boolean; isActive: boolean; issuer: string; subject: string;
    reason: string; correlationId: string;
  }) {
    const result = await pool.query<{ finance_platform_upsert_tax_jurisdiction_level: string }>(
      `SELECT public.finance_platform_upsert_tax_jurisdiction_level(
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11
      )`,
      [input.countryCode,input.levelCode,input.label,input.parentLevelCode ?? null,
       input.sortOrder,input.isRequired,input.isActive,input.issuer,input.subject,input.reason,input.correlationId],
    );
    return result.rows[0]?.finance_platform_upsert_tax_jurisdiction_level;
  },

  async createDelegation(input: {
    identityIssuer: string; identitySubject: string; jurisdictionId?: string | null;
    countryCode?: string | null; permissions: string[]; validFrom: string; validTo?: string | null;
    reason: string; issuer: string; subject: string; correlationId: string;
  }) {
    const result = await pool.query<{ finance_create_platform_tax_delegation: string }>(
      `SELECT public.finance_create_platform_tax_delegation(
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11
      )`,
      [input.identityIssuer,input.identitySubject,input.jurisdictionId ?? null,input.countryCode ?? null,
       input.permissions,input.validFrom,input.validTo ?? null,input.reason,input.issuer,input.subject,input.correlationId],
    );
    return result.rows[0]?.finance_create_platform_tax_delegation;
  },

  async listDelegations(issuer: string, subject: string) {
    const result = await pool.query(
      "SELECT * FROM public.finance_list_platform_tax_delegations($1,$2)",
      [issuer,subject],
    );
    return result.rows;
  },

  async revokeDelegation(input: {
    delegationId: string; reason: string; issuer: string; subject: string; correlationId: string;
  }) {
    const result = await pool.query<{ finance_revoke_platform_tax_delegation: boolean }>(
      "SELECT public.finance_revoke_platform_tax_delegation($1,$2,$3,$4,$5)",
      [input.delegationId,input.reason,input.issuer,input.subject,input.correlationId],
    );
    return result.rows[0]?.finance_revoke_platform_tax_delegation === true;
  },
};
