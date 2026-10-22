import { createHash } from "node:crypto";
import { Decimal } from "decimal.js";
import type { PoolClient } from "pg";
import type { FinanceRequestContext } from "../../integration-auth/types/authenticated-principal.js";
import type { CreateRefundInput, RecordManualRefundSuccessInput } from "../validators/refund.schema.js";
import type { RefundRecord, RefundStatus } from "../types/refund.types.js";

interface RefundRow {
  id: string; payment_id: string; amount: string; currency_code: string; status: RefundStatus; reason: string; requested_by_actor_ref: string;
  external_reference: string | null; approved_at: string | null; completed_at: string | null;
  created_at: string; updated_at: string;
}
interface PaymentRow { id: string; amount: string; currency_code: string; status: string; source: string; }
const refundColumns = `id,payment_id,amount::text,btrim(currency_code) AS currency_code,status,reason,requested_by_actor_ref,external_reference,
  CASE WHEN approved_at IS NULL THEN NULL ELSE to_char(approved_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END AS approved_at,
  CASE WHEN completed_at IS NULL THEN NULL ELSE to_char(completed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END AS completed_at,
  to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at,
  to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at`;

function mapRefund(row: RefundRow): RefundRecord {
  return { id: row.id, paymentId: row.payment_id, amount: row.amount, currencyCode: row.currency_code,
    status: row.status, reason: row.reason, externalReference: row.external_reference,
    approvedAt: row.approved_at, completedAt: row.completed_at, createdAt: row.created_at, updatedAt: row.updated_at };
}
function hash(value: unknown): string { return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex"); }

async function beginCommand(client: PoolClient, context: FinanceRequestContext, operation: string, key: string, requestHash: string) {
  await client.query(
    `INSERT INTO public.finance_payment_commands (tenant_id,operation,idempotency_key,request_hash)
     VALUES ($1,$2,$3,$4) ON CONFLICT (tenant_id,operation,idempotency_key) DO NOTHING`,
    [context.tenantId,operation,key,requestHash],
  );
  const result = await client.query<{ request_hash: string; state: string; resource_id: string | null }>(
    `SELECT request_hash,state,resource_id FROM public.finance_payment_commands
      WHERE tenant_id=$1 AND operation=$2 AND idempotency_key=$3 FOR UPDATE`,
    [context.tenantId,operation,key],
  );
  const command = result.rows[0];
  if (!command) throw new Error("PAYMENT_COMMAND_NOT_FOUND");
  if (command.request_hash.trim() !== requestHash) throw new Error("IDEMPOTENCY_KEY_REUSED");
  return command.state === "SUCCEEDED" && command.resource_id ? command.resource_id : null;
}
async function completeCommand(client: PoolClient, context: FinanceRequestContext, operation: string, key: string, resourceId: string) {
  await client.query(
    `UPDATE public.finance_payment_commands SET state='SUCCEEDED',resource_type='PAYMENT_REFUND',
       resource_id=$4::uuid,response_body=jsonb_build_object('resourceType','PAYMENT_REFUND','resourceId',$4::text),completed_at=clock_timestamp()
      WHERE tenant_id=$1 AND operation=$2 AND idempotency_key=$3 AND state='IN_PROGRESS'`,
    [context.tenantId,operation,key,resourceId],
  );
}
async function audit(client: PoolClient, context: FinanceRequestContext, action: string, refundId: string, paymentId: string, metadata: Record<string,unknown> = {}) {
  await client.query(
    `INSERT INTO public.finance_audit_events
      (tenant_id,actor_type,actor_ref,action,resource_type,resource_id,correlation_id,safe_metadata)
     VALUES ($1,'SERVICE',$2,$3,'PAYMENT_REFUND',$4,$5,$6::jsonb)`,
    [context.tenantId,context.principal.id,action,refundId,context.correlationId,JSON.stringify({paymentId,...metadata})],
  );
}
async function event(client: PoolClient, context: FinanceRequestContext, paymentId: string, type: string, key: string, metadata: Record<string,unknown> = {}) {
  await client.query(
    `INSERT INTO public.finance_payment_events
      (tenant_id,payment_id,event_type,actor_type,actor_ref,correlation_id,idempotency_key,safe_metadata)
     VALUES ($1,$2,$3,'SERVICE',$4,$5,$6,$7::jsonb)`,
    [context.tenantId,paymentId,type,context.principal.id,context.correlationId,key,JSON.stringify(metadata)],
  );
}
async function findRefund(client: PoolClient, tenantId: string, refundId: string): Promise<RefundRecord | null> {
  const result = await client.query<RefundRow>(
    `SELECT ${refundColumns} FROM public.finance_payment_refunds WHERE tenant_id=$1 AND id=$2`,
    [tenantId,refundId],
  );
  return result.rows[0] ? mapRefund(result.rows[0]) : null;
}
async function lockedPayment(client: PoolClient, tenantId: string, paymentId: string): Promise<PaymentRow> {
  const result = await client.query<PaymentRow>(
    `SELECT id,amount::text,btrim(currency_code) AS currency_code,status,source
       FROM public.finance_payments WHERE tenant_id=$1 AND id=$2 FOR UPDATE`,
    [tenantId,paymentId],
  );
  const payment = result.rows[0];
  if (!payment) throw new Error("PAYMENT_NOT_FOUND");
  if (payment.status !== "CONFIRMED" && payment.status !== "SETTLED") throw new Error("PAYMENT_NOT_CONFIRMED");
  return payment;
}
async function availableForRefund(client: PoolClient, tenantId: string, paymentId: string, paymentAmount: string): Promise<string> {
  const result = await client.query<{ allocated: string; reversed: string; reserved: string }>(
    `SELECT
      COALESCE((SELECT SUM(amount) FROM public.finance_payment_allocations WHERE tenant_id=$1 AND payment_id=$2),0)::text AS allocated,
      COALESCE((SELECT SUM(r.amount) FROM public.finance_payment_allocation_reversals r
        JOIN public.finance_payment_allocations a ON a.tenant_id=r.tenant_id AND a.id=r.allocation_id
        WHERE r.tenant_id=$1 AND a.payment_id=$2),0)::text AS reversed,
      COALESCE((SELECT SUM(amount) FROM public.finance_payment_refunds WHERE tenant_id=$1 AND payment_id=$2
        AND status NOT IN ('FAILED','CANCELLED')),0)::text AS reserved`,
    [tenantId,paymentId],
  );
  const row = result.rows[0];
  return new Decimal(paymentAmount).minus(row?.allocated ?? "0").plus(row?.reversed ?? "0").minus(row?.reserved ?? "0").toString();
}

export const refundRepository = {
  async request(client: PoolClient, context: FinanceRequestContext, paymentId: string, input: CreateRefundInput, key: string): Promise<RefundRecord> {
    const requestHash = hash({paymentId,...input});
    const replayId = await beginCommand(client,context,"REFUND_REQUEST",key,requestHash);
    if (replayId) {
      const replay = await findRefund(client,context.tenantId,replayId);
      if (replay) return replay;
      throw new Error("IDEMPOTENCY_RESOURCE_MISSING");
    }
    const payment = await lockedPayment(client,context.tenantId,paymentId);
    const currency = await client.query<{ minor_unit: number }>(
      "SELECT minor_unit FROM public.finance_currencies WHERE code=$1 AND is_active=true",[payment.currency_code],
    );
    if (!currency.rows[0]) throw new Error("CURRENCY_NOT_SUPPORTED");
    if (!new Decimal(input.amount).eq(new Decimal(input.amount).toDecimalPlaces(currency.rows[0].minor_unit))) {
      throw new Error("AMOUNT_PRECISION_INVALID");
    }
    if (new Decimal(input.amount).gt(await availableForRefund(client,context.tenantId,paymentId,payment.amount))) {
      throw new Error("REFUND_AMOUNT_EXCEEDED");
    }
    const inserted = await client.query<RefundRow>(
      `INSERT INTO public.finance_payment_refunds
        (tenant_id,payment_id,amount,currency_code,status,reason,requested_by_actor_type,requested_by_actor_ref)
       VALUES ($1,$2,$3,$4,'REQUESTED',$5,'SERVICE',$6) RETURNING ${refundColumns}`,
      [context.tenantId,paymentId,input.amount,payment.currency_code,input.reason,context.principal.id],
    );
    const row = inserted.rows[0];
    if (!row) throw new Error("REFUND_INSERT_RETURNED_NO_ROW");
    const refund = mapRefund(row);
    await event(client,context,paymentId,"REFUND_REQUESTED",key,{refundId:refund.id,amount:refund.amount,currencyCode:refund.currencyCode,reason:refund.reason});
    await audit(client,context,"payment.refund_requested",refund.id,paymentId,{amount:refund.amount,currencyCode:refund.currencyCode});
    await completeCommand(client,context,"REFUND_REQUEST",key,refund.id);
    return refund;
  },

  async approve(client: PoolClient, context: FinanceRequestContext, paymentId: string, refundId: string, key: string): Promise<RefundRecord> {
    const requestHash = hash({paymentId,refundId});
    const replayId = await beginCommand(client,context,"REFUND_APPROVE",key,requestHash);
    if (replayId) {
      const replay = await findRefund(client,context.tenantId,replayId);
      if (replay) return replay;
      throw new Error("IDEMPOTENCY_RESOURCE_MISSING");
    }
    await lockedPayment(client,context.tenantId,paymentId);
    const found = await client.query<RefundRow>(
      `SELECT ${refundColumns} FROM public.finance_payment_refunds
        WHERE tenant_id=$1 AND payment_id=$2 AND id=$3 FOR UPDATE`,
      [context.tenantId,paymentId,refundId],
    );
    const current = found.rows[0];
    if (!current) throw new Error("REFUND_NOT_FOUND");
    if (current.status !== "REQUESTED") throw new Error("REFUND_NOT_REQUESTED");
    if (current.requested_by_actor_ref === context.principal.id) throw new Error("REFUND_SELF_APPROVAL_FORBIDDEN");
    const updated = await client.query<RefundRow>(
      `UPDATE public.finance_payment_refunds SET status='APPROVED',approved_by_actor_type='SERVICE',
        approved_by_actor_ref=$4,approved_at=clock_timestamp(),updated_at=clock_timestamp()
        WHERE tenant_id=$1 AND payment_id=$2 AND id=$3 RETURNING ${refundColumns}`,
      [context.tenantId,paymentId,refundId,context.principal.id],
    );
    const row = updated.rows[0];
    if (!row) throw new Error("REFUND_UPDATE_FAILED");
    const refund = mapRefund(row);
    await event(client,context,paymentId,"REFUND_APPROVED",key,{refundId});
    await audit(client,context,"payment.refund_approved",refund.id,paymentId,{amount:refund.amount,currencyCode:refund.currencyCode});
    await completeCommand(client,context,"REFUND_APPROVE",key,refund.id);
    return refund;
  },

  async recordManualSuccess(
    client: PoolClient, context: FinanceRequestContext, paymentId: string, refundId: string,
    input: RecordManualRefundSuccessInput, key: string,
  ): Promise<RefundRecord> {
    const requestHash = hash({paymentId,refundId,...input});
    const replayId = await beginCommand(client,context,"REFUND_RECORD_MANUAL_SUCCESS",key,requestHash);
    if (replayId) {
      const replay = await findRefund(client,context.tenantId,replayId);
      if (replay) return replay;
      throw new Error("IDEMPOTENCY_RESOURCE_MISSING");
    }
    const payment = await lockedPayment(client,context.tenantId,paymentId);
    if (payment.source !== "MANUAL") throw new Error("PROVIDER_REFUND_REQUIRES_PROVIDER_ADAPTER");
    const found = await client.query<RefundRow>(
      `SELECT ${refundColumns} FROM public.finance_payment_refunds
        WHERE tenant_id=$1 AND payment_id=$2 AND id=$3 FOR UPDATE`,
      [context.tenantId,paymentId,refundId],
    );
    const current = found.rows[0];
    if (!current) throw new Error("REFUND_NOT_FOUND");
    if (current.status !== "APPROVED") throw new Error("REFUND_NOT_APPROVED");
    const updated = await client.query<RefundRow>(
      `UPDATE public.finance_payment_refunds SET status='SUCCEEDED',external_reference=COALESCE($4,external_reference),
        completed_by_actor_type='SERVICE',completed_by_actor_ref=$5,completed_at=clock_timestamp(),updated_at=clock_timestamp()
        WHERE tenant_id=$1 AND payment_id=$2 AND id=$3 RETURNING ${refundColumns}`,
      [context.tenantId,paymentId,refundId,input.externalReference ?? null,context.principal.id],
    );
    const row = updated.rows[0];
    if (!row) throw new Error("REFUND_UPDATE_FAILED");
    const refund = mapRefund(row);
    await event(client,context,paymentId,"REFUND_MANUALLY_COMPLETED",key,{refundId,amount:refund.amount,currencyCode:refund.currencyCode});
    await audit(client,context,"payment.refund_manually_completed",refund.id,paymentId,{amount:refund.amount,currencyCode:refund.currencyCode});
    await completeCommand(client,context,"REFUND_RECORD_MANUAL_SUCCESS",key,refund.id);
    return refund;
  },

  async cancel(client: PoolClient, context: FinanceRequestContext, paymentId: string, refundId: string, key: string): Promise<RefundRecord> {
    const requestHash = hash({paymentId,refundId});
    const replayId = await beginCommand(client,context,"REFUND_CANCEL",key,requestHash);
    if (replayId) {
      const replay = await findRefund(client,context.tenantId,replayId);
      if (replay) return replay;
      throw new Error("IDEMPOTENCY_RESOURCE_MISSING");
    }
    await lockedPayment(client,context.tenantId,paymentId);
    const found = await client.query<RefundRow>(
      `SELECT ${refundColumns} FROM public.finance_payment_refunds
        WHERE tenant_id=$1 AND payment_id=$2 AND id=$3 FOR UPDATE`,
      [context.tenantId,paymentId,refundId],
    );
    const current = found.rows[0];
    if (!current) throw new Error("REFUND_NOT_FOUND");
    if (current.status !== "REQUESTED" && current.status !== "APPROVED") throw new Error("REFUND_NOT_CANCELLABLE");
    const updated = await client.query<RefundRow>(
      `UPDATE public.finance_payment_refunds SET status='CANCELLED',updated_at=clock_timestamp()
        WHERE tenant_id=$1 AND payment_id=$2 AND id=$3 RETURNING ${refundColumns}`,
      [context.tenantId,paymentId,refundId],
    );
    const row = updated.rows[0];
    if (!row) throw new Error("REFUND_UPDATE_FAILED");
    const refund = mapRefund(row);
    await event(client,context,paymentId,"REFUND_CANCELLED",key,{refundId});
    await audit(client,context,"payment.refund_cancelled",refund.id,paymentId,{amount:refund.amount,currencyCode:refund.currencyCode});
    await completeCommand(client,context,"REFUND_CANCEL",key,refund.id);
    return refund;
  },
};
