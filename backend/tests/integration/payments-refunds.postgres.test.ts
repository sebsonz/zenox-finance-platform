import { createHash, randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { refundRepository } from "../../src/modules/payments/repositories/refund.repository.js";
import { paymentRepository } from "../../src/modules/payments/repositories/payment.repository.js";
import type { FinanceRequestContext } from "../../src/modules/integration-auth/types/authenticated-principal.js";

const adminUrl = process.env["TEST_DATABASE_URL"];
const runtimeUrl = process.env["TEST_RUNTIME_DATABASE_URL"];
const integrationDescribe = adminUrl && runtimeUrl ? describe : describe.skip;
const tenantA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const tenantB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

integrationDescribe("PostgreSQL payment refund and allocation controls", () => {
  let adminPool: Pool;
  let runtimePool: Pool;

  beforeAll(() => {
    adminPool = new Pool({ connectionString: adminUrl, max: 4 });
    runtimePool = new Pool({ connectionString: runtimeUrl, max: 6 });
  });

  afterAll(async () => {
    await Promise.all([adminPool?.end(), runtimePool?.end()]);
  });

  function context(tenantId: string, actorId = randomUUID()): FinanceRequestContext {
    return {
      tenantId,
      correlationId: `payments-refund-test-${randomUUID()}`,
      principal: {
        id: actorId,
        principalCode: "payments.refund.integration",
        displayName: "Payments refund integration test",
        scopes: ["payments:create", "payments:confirm_manual", "payments:allocate", "payments:read",
          "refunds:request", "refunds:approve", "refunds:record_manual", "refunds:cancel"],
        allowedTenantIds: [tenantId],
      },
    };
  }

  async function adminTransaction<T>(tenantId: string, work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await adminPool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id',$1,true)", [tenantId]);
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async function seedPaymentAndIssuedInvoice(tenantId = tenantA, amount = "100"): Promise<{ paymentId: string; invoiceId: string }> {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
    const paymentId = randomUUID();
    const invoiceId = randomUUID();
    await adminTransaction(tenantId, async (client) => {
      const customer = await client.query<{ id: string }>(
        `INSERT INTO public.finance_customers
          (tenant_id,customer_code,customer_type,legal_name,country_code,status,metadata)
         VALUES ($1,$2,'BUSINESS','Payment Refund Integration Customer','BJ','ACTIVE',
           '{"fixture":"payments-refunds-test"}'::jsonb) RETURNING id`,
        [tenantId,`PR_${suffix}`],
      );
      await client.query(
        `INSERT INTO public.finance_invoices
          (id,tenant_id,customer_id,status,currency_code,currency_minor_unit,customer_snapshot,
           subtotal,discount_total,taxable_total,tax_total,grand_total,amount_due,calculation_policy)
         VALUES ($1,$2,$3,'DRAFT','XOF',0,'{"legalName":"Payment Refund Integration Customer"}'::jsonb,
           $4,0,$4,0,$4,$4,'LINE_HALF_UP_TAX_EXCLUSIVE_V1')`,
        [invoiceId,tenantId,customer.rows[0]!.id,amount],
      );
      const snapshot = await client.query<{ id: string }>(
        `INSERT INTO public.finance_tax_calculation_snapshots
          (tenant_id,document_type,document_id,document_version,calculation_policy,engine_version,
           tax_date,currency_code,currency_minor_unit,input_snapshot,result_snapshot,applied_rules_snapshot)
         VALUES ($1,'INVOICE',$2,1,'INVOICE_TAX_SNAPSHOT_PER_LINE_V1','payments-refund-integration',
           CURRENT_DATE,'XOF',0,'{"fixture":"payments-refunds-test"}'::jsonb,
           '{"taxTotal":"0"}'::jsonb,'[]'::jsonb) RETURNING id`,
        [tenantId,invoiceId],
      );
      await client.query(
        `UPDATE public.finance_invoices SET status='ISSUED',invoice_code=$3,issue_date=CURRENT_DATE,
          issued_at=clock_timestamp(),issued_by_principal_id=$4,tax_snapshot_id=$5,
          tax_snapshot_version=1,tax_status='CALCULATED'
         WHERE tenant_id=$1 AND id=$2`,
        [tenantId,invoiceId,`INV-PR-${suffix}`,randomUUID(),snapshot.rows[0]!.id],
      );
      await client.query(
        `INSERT INTO public.finance_payments
          (id,tenant_id,amount,currency_code,status,source,method,external_reference,
           created_by_actor_type,created_by_actor_ref,confirmed_by_actor_type,confirmed_by_actor_ref,confirmed_at)
         VALUES ($1,$2,$3,'XOF','CONFIRMED','MANUAL','CASH',$4,'SERVICE',$5,'SERVICE',$5,clock_timestamp())`,
        [paymentId,tenantId,amount,`PR-${suffix}`,randomUUID()],
      );
    });
    return { paymentId, invoiceId };
  }

  async function runtimeInsertAllocation(tenantId: string, paymentId: string, invoiceId: string, amount: string) {
    const client = await runtimePool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id',$1,true)", [tenantId]);
      const key = `alloc-${randomUUID()}`;
      const requestHash = createHash("sha256").update(`${key}:${amount}`).digest("hex");
      const result = await client.query(
        `INSERT INTO public.finance_payment_allocations
          (tenant_id,payment_id,invoice_id,amount,currency_code,idempotency_key,request_hash,
           allocated_by_actor_type,allocated_by_actor_ref)
         VALUES ($1,$2,$3,$4,'XOF',$5,$6,'SERVICE','integration-test') RETURNING id`,
        [tenantId,paymentId,invoiceId,amount,key,requestHash],
      );
      await client.query("COMMIT");
      return result.rows[0]?.id as string;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async function runtimeInsertRefund(tenantId: string, paymentId: string, amount: string) {
    const client = await runtimePool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id',$1,true)", [tenantId]);
      const result = await client.query<{ id: string }>(
        `INSERT INTO public.finance_payment_refunds
          (tenant_id,payment_id,amount,currency_code,status,reason,requested_by_actor_type,requested_by_actor_ref)
         VALUES ($1,$2,$3,'XOF','REQUESTED','Concurrent refund test','SERVICE',$4) RETURNING id`,
        [tenantId,paymentId,amount,randomUUID()],
      );
      await client.query("COMMIT");
      return result.rows[0]!.id;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  it("replays refund requests idempotently and rejects payload reuse", async () => {
    const { paymentId } = await seedPaymentAndIssuedInvoice();
    const ctx = context(tenantA);
    const key = `refund-request-${randomUUID()}`;
    const input = { amount: "25", reason: "Customer overpayment" };
    const first = await adminTransaction(tenantA, (client) =>
      refundRepository.request(client,ctx,paymentId,input,key));
    const replay = await adminTransaction(tenantA, (client) =>
      refundRepository.request(client,ctx,paymentId,input,key));
    expect(replay.id).toBe(first.id);
    await expect(adminTransaction(tenantA, (client) =>
      refundRepository.request(client,ctx,paymentId,{...input,amount:"26"},key)))
      .rejects.toMatchObject({ message: "IDEMPOTENCY_KEY_REUSED" });
    const rows = await adminPool.query(
      "SELECT count(*)::int AS count FROM public.finance_payment_refunds WHERE tenant_id=$1 AND payment_id=$2",
      [tenantA,paymentId],
    );
    expect(rows.rows[0]?.count).toBe(1);
  });

  it("does not allow requester self-approval and supports a separate approver", async () => {
    const { paymentId } = await seedPaymentAndIssuedInvoice();
    const requester = context(tenantA,randomUUID());
    const approver = context(tenantA,randomUUID());
    const key = `refund-request-${randomUUID()}`;
    const refund = await adminTransaction(tenantA,(client) =>
      refundRepository.request(client,requester,paymentId,{amount:"10",reason:"Duplicate transfer"},key));
    await expect(adminTransaction(tenantA,(client) =>
      refundRepository.approve(client,requester,paymentId,refund.id,`approve-${randomUUID()}`)))
      .rejects.toMatchObject({message:"REFUND_SELF_APPROVAL_FORBIDDEN"});
    const approved = await adminTransaction(tenantA,(client) =>
      refundRepository.approve(client,approver,paymentId,refund.id,`approve-${randomUUID()}`));
    expect(approved.status).toBe("APPROVED");
  });

  it("releases a cancelled refund reservation and keeps active reservations unavailable to allocations", async () => {
    const { paymentId, invoiceId } = await seedPaymentAndIssuedInvoice(tenantA,"100");
    const requester = context(tenantA,randomUUID());
    const refund = await adminTransaction(tenantA,(client) =>
      refundRepository.request(client,requester,paymentId,{amount:"60",reason:"Customer requested refund"},"refund-request-" + randomUUID()));

    await expect(adminTransaction(tenantA,(client) =>
      paymentRepository.allocateInTransaction(client,requester,paymentId,{invoiceId,amount:"50"},"allocation-" + randomUUID()))
    ).rejects.toMatchObject({message:"PAYMENT_AMOUNT_EXCEEDED"});

    const cancelled = await adminTransaction(tenantA,(client) =>
      refundRepository.cancel(client,requester,paymentId,refund.id,"refund-cancel-" + randomUUID()));
    expect(cancelled.status).toBe("CANCELLED");

    const allocation = await adminTransaction(tenantA,(client) =>
      paymentRepository.allocateInTransaction(client,requester,paymentId,{invoiceId,amount:"100"},"allocation-" + randomUUID()));
    expect(allocation.amount).toBe("100.00000000");
  });
  it("serializes allocation and refund reservations against the same payment balance", async () => {
    const { paymentId, invoiceId } = await seedPaymentAndIssuedInvoice(tenantA,"100");
    const outcomes = await Promise.allSettled([
      runtimeInsertAllocation(tenantA,paymentId,invoiceId,"70"),
      runtimeInsertRefund(tenantA,paymentId,"70"),
    ]);
    expect(outcomes.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.find((item) => item.status === "rejected");
    expect(rejected?.status).toBe("rejected");
    if (rejected?.status === "rejected") {
      expect(String(rejected.reason)).toMatch(/PAYMENT_AMOUNT_EXCEEDED|REFUND_AMOUNT_EXCEEDED/);
    }
    const sums = await adminPool.query<{ allocated: string; reserved: string }>(
      `SELECT
        COALESCE((SELECT SUM(amount) FROM public.finance_payment_allocations WHERE tenant_id=$1 AND payment_id=$2),0)::text AS allocated,
        COALESCE((SELECT SUM(amount) FROM public.finance_payment_refunds WHERE tenant_id=$1 AND payment_id=$2
          AND status NOT IN ('FAILED','CANCELLED')),0)::text AS reserved`,
      [tenantA,paymentId],
    );
    expect(Number(sums.rows[0]?.allocated) + Number(sums.rows[0]?.reserved)).toBe(70);
  });

  it("hides refund rows without tenant context and from another tenant", async () => {
    const { paymentId } = await seedPaymentAndIssuedInvoice(tenantA,"50");
    const refundId = await adminTransaction(tenantA,async (client) => {
      const result = await client.query<{ id: string }>(
        `INSERT INTO public.finance_payment_refunds
          (tenant_id,payment_id,amount,currency_code,status,reason,requested_by_actor_type,requested_by_actor_ref)
         VALUES ($1,$2,5,'XOF','REQUESTED','RLS isolation test','SERVICE','rls-test') RETURNING id`,
        [tenantA,paymentId],
      );
      return result.rows[0]!.id;
    });
    const client = await runtimePool.connect();
    try {
      await client.query("BEGIN");
      const noTenant = await client.query("SELECT id FROM public.finance_payment_refunds WHERE id=$1",[refundId]);
      expect(noTenant.rowCount).toBe(0);
      await client.query("SELECT set_config('app.tenant_id',$1,true)",[tenantB]);
      const foreign = await client.query("SELECT id FROM public.finance_payment_refunds WHERE id=$1",[refundId]);
      expect(foreign.rowCount).toBe(0);
      await client.query("ROLLBACK");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  });
});
