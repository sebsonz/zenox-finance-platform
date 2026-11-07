import type { PoolClient } from "pg";
import type { FinanceRequestContext } from "../../integration-auth/types/authenticated-principal.js";

interface PaymentEventRow {
  id: string;
  payment_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_type: "USER" | "SERVICE" | "SYSTEM";
  actor_ref: string;
  correlation_id: string | null;
  safe_metadata: Record<string, unknown>;
  occurred_at: string;
}

const columns = `e.id, e.payment_id, e.event_type, e.from_status, e.to_status,
  e.actor_type, e.actor_ref, e.correlation_id, e.safe_metadata,
  to_char(e.occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS occurred_at`;

function mapEvent(row: PaymentEventRow) {
  return {
    id: row.id,
    paymentId: row.payment_id,
    eventType: row.event_type,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    actorType: row.actor_type,
    actorRef: row.actor_ref,
    correlationId: row.correlation_id,
    safeMetadata: row.safe_metadata,
    occurredAt: row.occurred_at,
  };
}

export const paymentEventsRepository = {
  async listPaymentEvents(client: PoolClient, context: FinanceRequestContext, paymentId: string, limit: number, cursor?: string) {
    const result = await client.query<PaymentEventRow>(
      `SELECT ${columns}
         FROM public.finance_payment_events e
        WHERE e.tenant_id = $1 AND e.payment_id = $2
          AND ($3::uuid IS NULL OR (e.occurred_at, e.id) <
            (SELECT c.occurred_at, c.id FROM public.finance_payment_events c
              WHERE c.tenant_id = $1 AND c.payment_id = $2 AND c.id = $3))
        ORDER BY e.occurred_at DESC, e.id DESC
        LIMIT $4`,
      [context.tenantId, paymentId, cursor ?? null, limit],
    );
    return {
      items: result.rows.map(mapEvent),
      nextCursor: result.rows.length === limit ? result.rows[result.rows.length - 1]?.id ?? null : null,
    };
  },

  async listRefundEvents(client: PoolClient, context: FinanceRequestContext, paymentId: string, refundId: string, limit: number, cursor?: string) {
    const result = await client.query<PaymentEventRow>(
      `SELECT ${columns}
         FROM public.finance_payment_events e
        WHERE e.tenant_id = $1 AND e.payment_id = $2
          AND e.event_type LIKE 'REFUND_%'
          AND e.safe_metadata->>'refundId' = $3
          AND ($4::uuid IS NULL OR (e.occurred_at, e.id) <
            (SELECT c.occurred_at, c.id FROM public.finance_payment_events c
              WHERE c.tenant_id = $1 AND c.payment_id = $2 AND c.id = $4
                AND c.event_type LIKE 'REFUND_%' AND c.safe_metadata->>'refundId' = $3))
        ORDER BY e.occurred_at DESC, e.id DESC
        LIMIT $5`,
      [context.tenantId, paymentId, refundId, cursor ?? null, limit],
    );
    return {
      items: result.rows.map(mapEvent),
      nextCursor: result.rows.length === limit ? result.rows[result.rows.length - 1]?.id ?? null : null,
    };
  },
};
