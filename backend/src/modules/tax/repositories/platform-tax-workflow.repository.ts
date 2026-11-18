import { pool } from "../../../db/pool.js";

export const platformTaxWorkflowRepository = {
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
