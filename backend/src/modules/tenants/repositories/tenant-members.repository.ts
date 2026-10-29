import { withTenantTransaction } from "../../../db/transaction.js";

export interface FinanceTenantMemberSummary {
  id: string;
  identity_issuer: string;
  identity_subject: string;
  role_code: "OWNER" | "ADMIN" | "FINANCE_MANAGER" | "FINANCE_OPERATOR" | "VIEWER";
  status: "PENDING" | "ACTIVE" | "SUSPENDED" | "REVOKED";
  invited_by: string | null;
  activated_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface TenantMemberPage {
  items: FinanceTenantMemberSummary[];
  limit: number;
  offset: number;
}

export const tenantMembersRepository = {
  async list(
    tenantId: string,
    limit: number,
    offset: number,
  ): Promise<TenantMemberPage> {
    return withTenantTransaction(tenantId, async (client) => {
      const result = await client.query<FinanceTenantMemberSummary>(
        `SELECT id, identity_issuer, identity_subject, role_code, status,
                invited_by, activated_at, created_at, updated_at
           FROM public.finance_user_tenant_memberships
          WHERE tenant_id = $1
          ORDER BY created_at ASC, id ASC
          LIMIT $2 OFFSET $3`,
        [tenantId, limit, offset],
      );
      return { items: result.rows, limit, offset };
    });
  },
};
