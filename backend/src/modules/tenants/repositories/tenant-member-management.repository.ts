import { withTenantTransaction } from "../../../db/transaction.js";

export type TenantMemberRole =
  | "OWNER"
  | "ADMIN"
  | "FINANCE_MANAGER"
  | "FINANCE_OPERATOR"
  | "VIEWER";
export type TenantMemberStatus = "PENDING" | "ACTIVE" | "SUSPENDED" | "REVOKED";

export interface UpdateTenantMemberInput {
  roleCode?: TenantMemberRole;
  status?: TenantMemberStatus;
}

export type UpdateTenantMemberResult =
  | { kind: "updated"; member: { id: string; role_code: TenantMemberRole; status: TenantMemberStatus; activated_at: Date | null } }
  | { kind: "not_found" }
  | { kind: "last_owner" };

export const tenantMemberManagementRepository = {
  async update(
    tenantId: string,
    memberId: string,
    input: UpdateTenantMemberInput,
  ): Promise<UpdateTenantMemberResult> {
    return withTenantTransaction(tenantId, async (client) => {
      // Serialize membership administration for this tenant to protect the last-owner invariant.
      await client.query("SELECT id FROM public.finance_tenants WHERE id = $1 FOR UPDATE", [tenantId]);
      const target = await client.query<{
        id: string;
        role_code: TenantMemberRole;
        status: TenantMemberStatus;
      }>(
        `SELECT id, role_code, status
           FROM public.finance_user_tenant_memberships
          WHERE tenant_id = $1 AND id = $2
          FOR UPDATE`,
        [tenantId, memberId],
      );
      const current = target.rows[0];
      if (!current) return { kind: "not_found" };

      const nextRole = input.roleCode ?? current.role_code;
      const nextStatus = input.status ?? current.status;
      if (
        current.role_code === "OWNER" &&
        current.status === "ACTIVE" &&
        (nextRole !== "OWNER" || nextStatus !== "ACTIVE")
      ) {
        const owners = await client.query<{ count: string }>(
          `SELECT count(*)::text AS count
             FROM public.finance_user_tenant_memberships
            WHERE tenant_id = $1 AND role_code = 'OWNER' AND status = 'ACTIVE'`,
          [tenantId],
        );
        if (Number(owners.rows[0]?.count ?? "0") <= 1) {
          return { kind: "last_owner" };
        }
      }

      const updated = await client.query<{
        id: string;
        role_code: TenantMemberRole;
        status: TenantMemberStatus;
        activated_at: Date | null;
      }>(
        `UPDATE public.finance_user_tenant_memberships
            SET role_code = $3,
                status = $4,
                activated_at = CASE
                  WHEN $4 = 'ACTIVE' THEN COALESCE(activated_at, now())
                  WHEN $4 = 'PENDING' THEN NULL
                  ELSE activated_at
                END,
                updated_at = now()
          WHERE tenant_id = $1 AND id = $2
          RETURNING id, role_code, status, activated_at`,
        [tenantId, memberId, nextRole, nextStatus],
      );
      return { kind: "updated", member: updated.rows[0]! };
    });
  },
};
