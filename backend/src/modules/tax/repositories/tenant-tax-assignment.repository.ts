import { pool } from "../../../db/pool.js";

export const tenantTaxAssignmentRepository = {
  async list(tenantId: string, issuer: string, subject: string) {
    const result = await pool.query(
      "SELECT * FROM public.finance_list_tenant_tax_assignments($1,$2,$3)",
      [tenantId,issuer,subject],
    );
    return result.rows;
  },

  async create(input: {
    tenantId: string; jurisdictionId: string; validFrom: string; validTo?: string | null;
    basisType: string; basisReference?: string | null; issuer: string; subject: string;
    initiatedBy: "TENANT" | "PLATFORM"; correlationId: string;
  }) {
    const result = await pool.query<{ finance_create_tenant_tax_assignment: string }>(
      "SELECT public.finance_create_tenant_tax_assignment($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
      [input.tenantId,input.jurisdictionId,input.validFrom,input.validTo ?? null,
       input.basisType,input.basisReference ?? null,input.issuer,input.subject,
       input.initiatedBy,input.correlationId],
    );
    return result.rows[0]?.finance_create_tenant_tax_assignment;
  },
};
