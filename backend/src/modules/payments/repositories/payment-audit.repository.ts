import type { PoolClient } from "pg";
import type { FinanceRequestContext } from "../../integration-auth/types/authenticated-principal.js";

export async function recordPaymentAudit(
  client: PoolClient,
  context: FinanceRequestContext,
  action: string,
  resourceType: string,
  resourceId: string,
  safeMetadata: Record<string, unknown> = {},
): Promise<void> {
  await client.query(
    `INSERT INTO public.finance_audit_events
      (tenant_id, actor_type, actor_ref, action, resource_type, resource_id, correlation_id, safe_metadata)
     VALUES ($1, 'SERVICE', $2, $3, $4, $5, $6, $7::jsonb)`,
    [context.tenantId, context.principal.id, action, resourceType, resourceId,
      context.correlationId, JSON.stringify(safeMetadata)],
  );
}
