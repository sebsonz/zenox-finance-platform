import { createHash } from "node:crypto";
import { Decimal } from "decimal.js";
import type { PoolClient } from "pg";
import type { FinanceRequestContext } from "../../integration-auth/types/authenticated-principal.js";
import type { AllocatePaymentInput, CreatePaymentInput, ReverseAllocationInput } from "../validators/payment.schema.js";
import type { InvoiceBalanceRecord, PaymentAllocationRecord, PaymentRecord, PaymentStatus } from "../types/payment.types.js";

interface PaymentRow {
  id: string; amount: string; currency_code: string; status: PaymentStatus; source: "MANUAL" | "PROVIDER";
  method: PaymentRecord["method"]; external_reference: string | null; provider_code: string | null;
  description: string | null; confirmed_at: string | null; created_at: string; updated_at: string;
}
interface AllocationRow {
  id: string; payment_id: string; invoice_id: string; amount: string; currency_code: string; created_at: string;
}
const paymentColumns = `id, amount::text, btrim(currency_code) AS currency_code, status, source, method,
  external_reference, provider_code, description,
  CASE WHEN confirmed_at IS NULL THEN NULL ELSE to_char(confirmed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END AS confirmed_at,
  to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at,
  to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at`;
const allocationColumns = `id, payment_id, invoice_id, amount::text, btrim(currency_code) AS currency_code,
  to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at`;

function mapPayment(row: PaymentRow): PaymentRecord {
  return { id: row.id, amount: row.amount, currencyCode: row.currency_code, status: row.status,
    source: row.source, method: row.method, externalReference: row.external_reference,
    providerCode: row.provider_code, description: row.description, confirmedAt: row.confirmed_at,
    createdAt: row.created_at, updatedAt: row.updated_at };
}
function mapAllocation(row: AllocationRow): PaymentAllocationRecord {
  return { id: row.id, paymentId: row.payment_id, invoiceId: row.invoice_id, amount: row.amount,
    currencyCode: row.currency_code, createdAt: row.created_at };
}
function requestHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

async function beginCommand(
  client: PoolClient, context: FinanceRequestContext, operation: string, key: string, hash: string,
): Promise<{ replayResourceId: string | null }> {
  await client.query(
    `INSERT INTO public.finance_payment_commands (tenant_id, operation, idempotency_key, request_hash)
     VALUES ($1,$2,$3,$4) ON CONFLICT (tenant_id, operation, idempotency_key) DO NOTHING`,
    [context.tenantId, operation, key, hash],
  );
  const result = await client.query<{ request_hash: string; state: string; resource_id: string | null }>(
    `SELECT request_hash, state, resource_id FROM public.finance_payment_commands
      WHERE tenant_id = $1 AND operation = $2 AND idempotency_key = $3 FOR UPDATE`,
    [context.tenantId, operation, key],
  );
  const command = result.rows[0];
  if (!command) throw new Error("PAYMENT_COMMAND_NOT_FOUND");
  if (command.request_hash.trim() !== hash) throw new Error("IDEMPOTENCY_KEY_REUSED");
  if (command.state === "SUCCEEDED" && command.resource_id) return { replayResourceId: command.resource_id };
  return { replayResourceId: null };
}
async function completeCommand(
  client: PoolClient, context: FinanceRequestContext, operation: string, key: string, resourceType: string, resourceId: string,
): Promise<void> {
  await client.query(
    `UPDATE public.finance_payment_commands SET state='SUCCEEDED', resource_type=$4, resource_id=$5,
       response_body=jsonb_build_object('resourceType',$4,'resourceId',$5), completed_at=clock_timestamp()
      WHERE tenant_id=$1 AND operation=$2 AND idempotency_key=$3 AND state='IN_PROGRESS'`,
    [context.tenantId, operation, key, resourceType, resourceId],
  );
}
async function audit(
  client: PoolClient, context: FinanceRequestContext, action: string, resourceType: string, resourceId: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await client.query(
    `INSERT INTO public.finance_audit_events
      (tenant_id, actor_type, actor_ref, action, resource_type, resource_id, correlation_id, safe_metadata)
     VALUES ($1,'SERVICE',$2,$3,$4,$5,$6,$7::jsonb)`,
    [context.tenantId, context.principal.id, action, resourceType, resourceId, context.correlationId, JSON.stringify(metadata)],
  );
}
async function paymentEvent(
  client: PoolClient, context: FinanceRequestContext, paymentId: string, eventType: string,
  fromStatus: string | null, toStatus: string | null, key: string | null, metadata: Record<string, unknown> = {},
): Promise<void> {
  await client.query(
    `INSERT INTO public.finance_payment_events
      (tenant_id,payment_id,event_type,from_status,to_status,actor_type,actor_ref,correlation_id,idempotency_key,safe_metadata)
     VALUES ($1,$2,$3,$4,$5,'SERVICE',$6,$7,$8,$9::jsonb)`,
    [context.tenantId, paymentId, eventType, fromStatus, toStatus, context.principal.id,
      context.correlationId, key, JSON.stringify(metadata)],
  );
}

export const paymentRepository = {
  async findById(client: PoolClient, tenantId: string, paymentId: string): Promise<PaymentRecord | null> {
    const result = await client.query<PaymentRow>(
      `SELECT ${paymentColumns} FROM public.finance_payments WHERE tenant_id=$1 AND id=$2`,
      [tenantId, paymentId],
    );
    return result.rows[0] ? mapPayment(result.rows[0]) : null;
  },

  async createInTransaction(
    client: PoolClient, context: FinanceRequestContext, input: CreatePaymentInput, key: string,
  ): Promise<PaymentRecord> {
    const hash = requestHash(input);
    const command = await beginCommand(client, context, "PAYMENT_CREATE", key, hash);
    if (command.replayResourceId) {
      const replay = await this.findById(client, context.tenantId, command.replayResourceId);
      if (replay) return replay;
      throw new Error("IDEMPOTENCY_RESOURCE_MISSING");
    }
    const currency = await client.query<{ code: string; minor_unit: number }>(
      "SELECT code, minor_unit FROM public.finance_currencies WHERE code=$1 AND is_active=true",
      [input.currencyCode],
    );
    if (!currency.rows[0]) throw new Error("CURRENCY_NOT_SUPPORTED");
    if (!new Decimal(input.amount).eq(new Decimal(input.amount).toDecimalPlaces(currency.rows[0].minor_unit))) {
      throw new Error("AMOUNT_PRECISION_INVALID");
    }
    const result = await client.query<PaymentRow>(
      `INSERT INTO public.finance_payments
        (tenant_id,amount,currency_code,status,source,method,external_reference,provider_code,description,
         created_by_actor_type,created_by_actor_ref)
       VALUES ($1,$2,$3,'PENDING',$4,$5,$6,$7,$8,'SERVICE',$9)
       RETURNING ${paymentColumns}`,
      [context.tenantId,input.amount,input.currencyCode,input.source,input.method,
       input.externalReference ?? null,input.providerCode ?? null,input.description ?? null,context.principal.id],
    );
    const row = result.rows[0];
    if (!row) throw new Error("PAYMENT_INSERT_RETURNED_NO_ROW");
    const payment = mapPayment(row);
    await paymentEvent(client, context, payment.id, "PAYMENT_CREATED", null, "PENDING", key, {
      amount: payment.amount, currencyCode: payment.currencyCode, source: payment.source, method: payment.method,
    });
    await audit(client, context, "payment.created", "PAYMENT", payment.id, {
      amount: payment.amount, currencyCode: payment.currencyCode, source: payment.source, method: payment.method,
    });
    await completeCommand(client, context, "PAYMENT_CREATE", key, "PAYMENT", payment.id);
    return payment;
  },

  async confirmManualInTransaction(
    client: PoolClient, context: FinanceRequestContext, paymentId: string, key: string,
  ): Promise<PaymentRecord> {
    const command = await beginCommand(client, context, "PAYMENT_CONFIRM_MANUAL", key, requestHash({ paymentId }));
    if (command.replayResourceId) {
      const replay = await this.findById(client, context.tenantId, command.replayResourceId);
      if (replay) return replay;
      throw new Error("IDEMPOTENCY_RESOURCE_MISSING");
    }
    const found = await client.query<PaymentRow>(
      `SELECT ${paymentColumns} FROM public.finance_payments WHERE tenant_id=$1 AND id=$2 FOR UPDATE`,
      [context.tenantId, paymentId],
    );
    const existing = found.rows[0];
    if (!existing) throw new Error("PAYMENT_NOT_FOUND");
    if (existing.source !== "MANUAL") throw new Error("PROVIDER_PAYMENT_REQUIRES_PROVIDER_CONFIRMATION");
    if (existing.status !== "PENDING") throw new Error("PAYMENT_NOT_PENDING");
    const updated = await client.query<PaymentRow>(
      `UPDATE public.finance_payments SET status='CONFIRMED', confirmed_at=clock_timestamp(),
         confirmed_by_actor_type='SERVICE', confirmed_by_actor_ref=$3, updated_at=clock_timestamp()
       WHERE tenant_id=$1 AND id=$2 AND status='PENDING' RETURNING ${paymentColumns}`,
      [context.tenantId,paymentId,context.principal.id],
    );
    const row = updated.rows[0];
    if (!row) throw new Error("PAYMENT_CONFIRMATION_RACE");
    const payment = mapPayment(row);
    await paymentEvent(client, context, payment.id, "PAYMENT_MANUALLY_CONFIRMED", "PENDING", "CONFIRMED", key, {});
    await audit(client, context, "payment.manually_confirmed", "PAYMENT", payment.id, {
      amount: payment.amount, currencyCode: payment.currencyCode,
    });
    await completeCommand(client, context, "PAYMENT_CONFIRM_MANUAL", key, "PAYMENT", payment.id);
    return payment;
  },

  async allocateInTransaction(
    client: PoolClient, context: FinanceRequestContext, paymentId: string, input: AllocatePaymentInput, key: string,
  ): Promise<PaymentAllocationRecord> {
    const hash = requestHash({ paymentId, ...input });
    const command = await beginCommand(client, context, "PAYMENT_ALLOCATE", key, hash);
    if (command.replayResourceId) {
      const replay = await client.query<AllocationRow>(
        `SELECT ${allocationColumns} FROM public.finance_payment_allocations
          WHERE tenant_id=$1 AND id=$2`,
        [context.tenantId, command.replayResourceId],
      );
      if (replay.rows[0]) return mapAllocation(replay.rows[0]);
      throw new Error("IDEMPOTENCY_RESOURCE_MISSING");
    }
    const paymentResult = await client.query<{
      id: string; amount: string; currency_code: string; status: PaymentStatus;
    }>(
      `SELECT id, amount::text, btrim(currency_code) AS currency_code, status
         FROM public.finance_payments WHERE tenant_id=$1 AND id=$2 FOR UPDATE`,
      [context.tenantId, paymentId],
    );
    const payment = paymentResult.rows[0];
    if (!payment) throw new Error("PAYMENT_NOT_FOUND");
    if (payment.status !== "CONFIRMED" && payment.status !== "SETTLED") throw new Error("PAYMENT_NOT_CONFIRMED");
    const invoiceResult = await client.query<{
      id: string; status: string; currency_code: string; grand_total: string; currency_minor_unit: number;
    }>(
      `SELECT id,status,btrim(currency_code) AS currency_code,grand_total::text,currency_minor_unit
         FROM public.finance_invoices WHERE tenant_id=$1 AND id=$2 FOR UPDATE`,
      [context.tenantId,input.invoiceId],
    );
    const invoice = invoiceResult.rows[0];
    if (!invoice) throw new Error("INVOICE_NOT_FOUND");
    if (invoice.status !== "ISSUED") throw new Error("INVOICE_NOT_ISSUED");
    if (payment.currency_code !== invoice.currency_code) throw new Error("PAYMENT_CURRENCY_MISMATCH");
    if (!new Decimal(input.amount).eq(new Decimal(input.amount).toDecimalPlaces(invoice.currency_minor_unit))) {
      throw new Error("AMOUNT_PRECISION_INVALID");
    }

    const usedByPayment = await client.query<{ total: string }>(
      `SELECT (COALESCE((SELECT SUM(a.amount) FROM public.finance_payment_allocations a
           WHERE a.tenant_id=$1 AND a.payment_id=$2),0)
         - COALESCE((SELECT SUM(r.amount) FROM public.finance_payment_allocation_reversals r
           JOIN public.finance_payment_allocations a ON a.tenant_id=r.tenant_id AND a.id=r.allocation_id
           WHERE r.tenant_id=$1 AND a.payment_id=$2),0))::text AS total`,
      [context.tenantId,paymentId],
    );
    const usedByInvoice = await client.query<{ total: string }>(
      `SELECT (COALESCE((SELECT SUM(a.amount) FROM public.finance_payment_allocations a
           WHERE a.tenant_id=$1 AND a.invoice_id=$2),0)
         - COALESCE((SELECT SUM(r.amount) FROM public.finance_payment_allocation_reversals r
           JOIN public.finance_payment_allocations a ON a.tenant_id=r.tenant_id AND a.id=r.allocation_id
           WHERE r.tenant_id=$1 AND a.invoice_id=$2),0))::text AS total`,
      [context.tenantId,input.invoiceId],
    );
    const available = Decimal(payment.amount).minus(usedByPayment.rows[0]?.total ?? "0").toString();
    const balance = Decimal(invoice.grand_total).minus(usedByInvoice.rows[0]?.total ?? "0").toString();
    const requested = Decimal(input.amount);
    if (!requested.isFinite() || requested.lte(0)) throw new Error("INVALID_AMOUNT");
    if (requested.gt(available)) throw new Error("PAYMENT_AMOUNT_EXCEEDED");
    if (requested.gt(balance)) throw new Error("INVOICE_BALANCE_EXCEEDED");

    const created = await client.query<AllocationRow>(
      `INSERT INTO public.finance_payment_allocations
        (tenant_id,payment_id,invoice_id,amount,currency_code,idempotency_key,request_hash,
         allocated_by_actor_type,allocated_by_actor_ref)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'SERVICE',$8) RETURNING ${allocationColumns}`,
      [context.tenantId,paymentId,input.invoiceId,input.amount,payment.currency_code,key,hash,context.principal.id],
    );
    const allocationRow = created.rows[0];
    if (!allocationRow) throw new Error("PAYMENT_ALLOCATION_INSERT_RETURNED_NO_ROW");
    const allocation = mapAllocation(allocationRow);
    await paymentEvent(client, context, paymentId, "PAYMENT_ALLOCATED", payment.status, payment.status, key, {
      allocationId: allocation.id, invoiceId: allocation.invoiceId, amount: allocation.amount, currencyCode: allocation.currencyCode,
    });
    await audit(client, context, "payment.allocated", "PAYMENT_ALLOCATION", allocation.id, {
      paymentId, invoiceId: allocation.invoiceId, amount: allocation.amount, currencyCode: allocation.currencyCode,
    });
    await completeCommand(client, context, "PAYMENT_ALLOCATE", key, "PAYMENT_ALLOCATION", allocation.id);
    return allocation;
  },

  async reverseAllocationInTransaction(
    client: PoolClient, context: FinanceRequestContext, paymentId: string, allocationId: string, input: ReverseAllocationInput, key: string,
  ): Promise<{ id: string; allocationId: string; amount: string; reason: string; createdAt: string }> {
    const hash = requestHash({ paymentId, allocationId, ...input });
    const command = await beginCommand(client, context, "ALLOCATION_REVERSE", key, hash);
    if (command.replayResourceId) {
      const replay = await client.query<{ id: string; allocation_id: string; amount: string; reason: string; created_at: string }>(
        `SELECT id,allocation_id,amount::text,reason,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at
           FROM public.finance_payment_allocation_reversals WHERE tenant_id=$1 AND id=$2`,
        [context.tenantId,command.replayResourceId],
      );
      const row = replay.rows[0];
      if (row) return { id: row.id, allocationId: row.allocation_id, amount: row.amount, reason: row.reason, createdAt: row.created_at };
      throw new Error("IDEMPOTENCY_RESOURCE_MISSING");
    }
    const allocationResult = await client.query<AllocationRow>(
      `SELECT ${allocationColumns} FROM public.finance_payment_allocations
        WHERE tenant_id=$1 AND payment_id=$2 AND id=$3 FOR UPDATE`,
      [context.tenantId,paymentId,allocationId],
    );
    const allocation = allocationResult.rows[0];
    if (!allocation) throw new Error("ALLOCATION_NOT_FOUND");
    const reversedResult = await client.query<{ total: string }>(
      "SELECT COALESCE(SUM(amount),0)::text AS total FROM public.finance_payment_allocation_reversals WHERE tenant_id=$1 AND allocation_id=$2",
      [context.tenantId,allocationId],
    );
    const remaining = Decimal(allocation.amount)
      .minus(reversedResult.rows[0]?.total ?? "0");
    const requested = Decimal(input.amount);
    if (!requested.isFinite() || requested.lte(0)) throw new Error("INVALID_AMOUNT");
    if (requested.gt(remaining)) throw new Error("ALLOCATION_REVERSAL_EXCEEDED");
    const result = await client.query<{ id: string; allocation_id: string; amount: string; reason: string; created_at: string }>(
      `INSERT INTO public.finance_payment_allocation_reversals
        (tenant_id,allocation_id,amount,reason,idempotency_key,request_hash,reversed_by_actor_type,reversed_by_actor_ref)
       VALUES ($1,$2,$3,$4,$5,$6,'SERVICE',$7)
       RETURNING id,allocation_id,amount::text,reason,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at`,
      [context.tenantId,allocationId,input.amount,input.reason,key,hash,context.principal.id],
    );
    const row = result.rows[0];
    if (!row) throw new Error("ALLOCATION_REVERSAL_INSERT_RETURNED_NO_ROW");
    await paymentEvent(client, context, allocation.payment_id, "ALLOCATION_REVERSED", null, null, key, {
      allocationId, reversalId: row.id, amount: row.amount, reason: row.reason,
    });
    await audit(client, context, "payment.allocation_reversed", "PAYMENT_ALLOCATION_REVERSAL", row.id, {
      allocationId, amount: row.amount, reason: row.reason,
    });
    await completeCommand(client, context, "ALLOCATION_REVERSE", key, "ALLOCATION_REVERSAL", row.id);
    return { id: row.id, allocationId: row.allocation_id, amount: row.amount, reason: row.reason, createdAt: row.created_at };
  },

  async list(client: PoolClient, tenantId: string, status: string | undefined, cursor: string | undefined, limit: number): Promise<PaymentRecord[]> {
    const result = await client.query<PaymentRow>(
      `SELECT ${paymentColumns} FROM public.finance_payments
        WHERE tenant_id=$1 AND ($2::text IS NULL OR status=$2)
          AND ($3::uuid IS NULL OR (created_at,id) < (
            SELECT c.created_at,c.id FROM public.finance_payments c WHERE c.tenant_id=$1 AND c.id=$3::uuid
          ))
        ORDER BY created_at DESC,id DESC LIMIT $4`,
      [tenantId,status ?? null,cursor ?? null,limit],
    );
    return result.rows.map(mapPayment);
  },

  async balance(client: PoolClient, tenantId: string, invoiceId: string): Promise<InvoiceBalanceRecord | null> {
    const result = await client.query<{
      id: string; invoice_code: string | null; status: "DRAFT" | "ISSUED" | "CANCELLED";
      currency_code: string; grand_total: string; allocated_amount: string; remaining_balance: string;
    }>(
      `SELECT i.id,i.invoice_code,i.status,btrim(i.currency_code) AS currency_code,
        i.grand_total::text,
        (COALESCE((SELECT SUM(a.amount) FROM public.finance_payment_allocations a
          WHERE a.tenant_id=i.tenant_id AND a.invoice_id=i.id),0)
         - COALESCE((SELECT SUM(r.amount) FROM public.finance_payment_allocation_reversals r
          JOIN public.finance_payment_allocations a ON a.tenant_id=r.tenant_id AND a.id=r.allocation_id
          WHERE r.tenant_id=i.tenant_id AND a.invoice_id=i.id),0))::text AS allocated_amount,
        (i.grand_total
         - COALESCE((SELECT SUM(a.amount) FROM public.finance_payment_allocations a
          WHERE a.tenant_id=i.tenant_id AND a.invoice_id=i.id),0)
         + COALESCE((SELECT SUM(r.amount) FROM public.finance_payment_allocation_reversals r
          JOIN public.finance_payment_allocations a ON a.tenant_id=r.tenant_id AND a.id=r.allocation_id
          WHERE r.tenant_id=i.tenant_id AND a.invoice_id=i.id),0))::text AS remaining_balance
       FROM public.finance_invoices i WHERE i.tenant_id=$1 AND i.id=$2`,
      [tenantId,invoiceId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return { invoiceId: row.id, invoiceCode: row.invoice_code, status: row.status,
      currencyCode: row.currency_code, grandTotal: row.grand_total,
      allocatedAmount: row.allocated_amount, remainingBalance: row.remaining_balance };
  }
};

