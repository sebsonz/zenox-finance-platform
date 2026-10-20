import type { PoolClient } from "pg";
import type { FinanceInvoiceOperationContext } from "../types/invoice-operation-context.js";
import { invoiceActor } from "../types/invoice-operation-context.js";

export async function recordInvoiceAudit(
  client: PoolClient,
  context: FinanceInvoiceOperationContext,
  action: string,
  resourceType: string,
  resourceId: string | null,
  safeMetadata: Record<string, unknown> = {},
): Promise<void> {
  const actor = invoiceActor(context);
  await client.query(
    `INSERT INTO public.finance_audit_events
      (tenant_id, actor_type, actor_ref, action, resource_type, resource_id, correlation_id, safe_metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
    [context.tenantId, actor.type, actor.ref, action, resourceType, resourceId, context.correlationId, JSON.stringify(safeMetadata)],
  );
}
