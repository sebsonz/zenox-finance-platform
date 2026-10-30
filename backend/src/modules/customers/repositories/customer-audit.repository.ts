import type { PoolClient } from "pg";
import type { FinanceCustomerOperationContext } from "../types/customer-operation-context.js";
import { customerActor } from "../types/customer-operation-context.js";

/** Persist customer-domain audit evidence in the same tenant transaction as the mutation. */
export async function recordCustomerAudit(
  client: PoolClient,
  context: FinanceCustomerOperationContext,
  action: string,
  resourceType: "CUSTOMER" | "CUSTOMER_CONTACT" | "CUSTOMER_ADDRESS",
  resourceId: string,
  safeMetadata: Record<string, unknown> = {},
): Promise<void> {
  const actor = customerActor(context);
  await client.query(
    `INSERT INTO public.finance_audit_events
      (tenant_id, actor_type, actor_ref, action, resource_type, resource_id, correlation_id, safe_metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
    [context.tenantId, actor.type, actor.ref, action, resourceType, resourceId, context.correlationId, JSON.stringify(safeMetadata)],
  );
}
