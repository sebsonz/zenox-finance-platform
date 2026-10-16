import { pool } from "../../../db/pool.js";

export interface FinanceTenantRecord {
  id: string;
  tenant_code: string;
  legal_name: string;
  status: "PENDING" | "ACTIVE" | "SUSPENDED" | "DISABLED";
}

export const tenantRepository = {
  async findActiveById(tenantId: string): Promise<FinanceTenantRecord | null> {
    const result = await pool.query<FinanceTenantRecord>(
      `SELECT id, tenant_code, legal_name, status
         FROM public.finance_tenants
        WHERE id = $1 AND status = 'ACTIVE'
        LIMIT 1`,
      [tenantId],
    );
    return result.rows[0] ?? null;
  },
};
