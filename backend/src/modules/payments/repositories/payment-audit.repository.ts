import type { PoolClient } from "pg";
import type { FinancePaymentContext } from "../types/payment-operation-context.js";
import { paymentActor } from "../types/payment-operation-context.js";

export async function recordPaymentAudit(
  client: PoolClient,
  context: FinancePaymentContext,
  action: string,
  resourceType: string,
  resourceId: string,
  safeMetadata: Record<string, unknown> = {},
): Promise<void> {
  const actor = paymentActor(context);
  await client.query(
    `INSERT INTO public.finance_audit_events
      (tenant_id, actor_type, actor_ref, action, resource_type, resource_id, correlation_id, safe_metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
    [context.tenantId, actor.type, actor.ref, action, resourceType, resourceId,
      context.correlationId, JSON.stringify(safeMetadata)],
  );
}
