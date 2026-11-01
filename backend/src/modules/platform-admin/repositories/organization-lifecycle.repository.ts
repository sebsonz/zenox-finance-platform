import { pool } from "../../../db/pool.js";

export type OrganizationLifecycleAction = "SUSPEND" | "REACTIVATE";

export interface OrganizationLifecycleResult {
  tenant_id: string;
  status: "ACTIVE" | "SUSPENDED";
  updated_at: Date;
}

export interface OrganizationLifecycleInput {
  operatorIssuer: string;
  operatorSubject: string;
  tenantId: string;
  action: OrganizationLifecycleAction;
  reason: string;
  correlationId: string;
}

export const organizationLifecycleRepository = {
  async apply(input: OrganizationLifecycleInput): Promise<OrganizationLifecycleResult> {
    const result = await pool.query<OrganizationLifecycleResult>(
      `SELECT tenant_id, status, updated_at
         FROM public.finance_platform_set_organization_status($1, $2, $3, $4, $5, $6)`,
      [
        input.operatorIssuer,
        input.operatorSubject,
        input.tenantId,
        input.action,
        input.reason,
        input.correlationId,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("ORGANIZATION_LIFECYCLE_ACTION_FAILED");
    return row;
  },
};
