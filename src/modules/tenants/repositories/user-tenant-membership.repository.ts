import { withTenantTransaction } from "../../../db/transaction.js";

export type FinanceUserRole =
  | "OWNER"
  | "ADMIN"
  | "FINANCE_MANAGER"
  | "FINANCE_OPERATOR"
  | "VIEWER";

export interface FinanceUserMembership {
  id: string;
  tenant_id: string;
  identity_issuer: string;
  identity_subject: string;
  role_code: FinanceUserRole;
  status: "PENDING" | "ACTIVE" | "SUSPENDED" | "REVOKED";
  activated_at: Date | null;
}

export const userTenantMembershipRepository = {
  async findActiveMembership(
    tenantId: string,
    identityIssuer: string,
    identitySubject: string,
  ): Promise<FinanceUserMembership | null> {
    return withTenantTransaction(tenantId, async (client) => {
      const result = await client.query<FinanceUserMembership>(
        `SELECT id, tenant_id, identity_issuer, identity_subject,
                role_code, status, activated_at
           FROM public.finance_user_tenant_memberships
          WHERE tenant_id = $1
            AND identity_issuer = $2
            AND identity_subject = $3
            AND status = 'ACTIVE'
          LIMIT 1`,
        [tenantId, identityIssuer, identitySubject],
      );
      return result.rows[0] ?? null;
    });
  },
};
