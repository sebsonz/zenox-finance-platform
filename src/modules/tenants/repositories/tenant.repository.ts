import { withTenantTransaction } from "../../../db/transaction.js";

export interface FinanceTenantRecord {
  id: string;
  tenant_code: string;
  legal_name: string;
  status: "PENDING" | "ACTIVE" | "SUSPENDED" | "DISABLED";
}

export const tenantRepository = {
  async findActiveById(tenantId: string): Promise<FinanceTenantRecord | null> {
    // finance_tenants uses its own id as the tenant boundary. The transaction
    // sets app.tenant_id locally so FORCE RLS can expose only this tenant row.
    return withTenantTransaction(tenantId, async (client) => {
      const result = await client.query<FinanceTenantRecord>(
        `SELECT id, tenant_code, legal_name, status
           FROM public.finance_tenants
          WHERE id = $1 AND status = 'ACTIVE'
          LIMIT 1`,
        [tenantId],
      );
      return result.rows[0] ?? null;
    });
  },
};
