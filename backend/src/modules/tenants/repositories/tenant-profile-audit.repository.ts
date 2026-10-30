import type { PoolClient } from "pg";
import type { FinanceUserTenantContext } from "../application/tenant-profile-operation-context.js";

/** Tenant profile audit evidence; never include identifiers or other secrets. */
export async function recordTenantProfileAudit(
  client: PoolClient,
  context: FinanceUserTenantContext,
  action: "tenant.profile.updated" | "tenant.address.created",
  resourceType: "TENANT_PROFILE" | "TENANT_ADDRESS",
  resourceId: string,
  safeMetadata: Record<string, unknown> = {},
): Promise<void> {
  await client.query(
    `INSERT INTO public.finance_audit_events
      (tenant_id, actor_type, actor_ref, action, resource_type, resource_id, correlation_id, safe_metadata)
     VALUES ($1, 'USER', $2, $3, $4, $5, $6, $7::jsonb)`,
    [
      context.tenantId,
      context.actor.ref,
      action,
      resourceType,
      resourceId,
      context.correlationId,
      JSON.stringify(safeMetadata),
    ],
  );
}
