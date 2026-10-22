import { createHash, randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import app from "../../src/app.js";

const adminUrl = process.env["TEST_DATABASE_URL"];
const tenantId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const secretA = "payments-http-test-secret-A-" + randomUUID() + "-long";
const secretB = "payments-http-test-secret-B-" + randomUUID() + "-long";
const principalCodeA = "payments.http.test.a";
const principalCodeB = "payments.http.test.b";
const scopes = [
  "payments:create","payments:confirm_manual","payments:allocate","payments:read",
  "invoice:read","refunds:request","refunds:approve","refunds:record_manual","refunds:cancel","refunds:read",
  "reconciliation:manage","reconciliation:read",
];

describe("payments HTTP security and authenticated workflows", () => {
  let server: ReturnType<typeof app.listen>;
  let baseUrl: string;
  let adminPool: Pool;
  let principalA: string;
  let principalB: string;

  const headers = (principalCode: string, secret: string, idempotencyKey?: string) => ({
    "content-type": "application/json",
    "x-finance-client-id": principalCode,
    "x-finance-tenant-id": tenantId,
    authorization: "Bearer " + secret,
    ...(idempotencyKey ? {"Idempotency-Key": idempotencyKey} : {}),
  });

  async function seedIssuedInvoice(total: string): Promise<string> {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
    const invoiceId = randomUUID();
    const client = await adminPool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id',$1,true)", [tenantId]);
      const customer = await client.query<{id:string}>(
        `INSERT INTO public.finance_customers
          (tenant_id,customer_code,customer_type,legal_name,country_code,status,metadata)
         VALUES ($1,$2,'BUSINESS','Payments HTTP Integration Customer','BJ','ACTIVE',
           '{"fixture":"payments-http-test"}'::jsonb) RETURNING id`,
        [tenantId,"PH_"+suffix],
      );
      await client.query(
        `INSERT INTO public.finance_invoices
          (id,tenant_id,customer_id,status,currency_code,currency_minor_unit,customer_snapshot,
           subtotal,discount_total,taxable_total,tax_total,grand_total,amount_due,calculation_policy)
         VALUES ($1,$2,$3,'DRAFT','XOF',0,'{"legalName":"Payments HTTP Integration Customer"}'::jsonb,
           $4,0,$4,0,$4,$4,'LINE_HALF_UP_TAX_EXCLUSIVE_V1')`,
        [invoiceId,tenantId,customer.rows[0]!.id,total],
      );
      const snapshot = await client.query<{id:string}>(
        `INSERT INTO public.finance_tax_calculation_snapshots
          (tenant_id,document_type,document_id,document_version,calculation_policy,engine_version,
           tax_date,currency_code,currency_minor_unit,input_snapshot,result_snapshot,applied_rules_snapshot)
         VALUES ($1,'INVOICE',$2,1,'INVOICE_TAX_SNAPSHOT_PER_LINE_V1','payments-http-test',
           CURRENT_DATE,'XOF',0,'{"fixture":"payments-http-test"}'::jsonb,
           '{"taxTotal":"0"}'::jsonb,'[]'::jsonb) RETURNING id`,
        [tenantId,invoiceId],
      );
      await client.query(
        `UPDATE public.finance_invoices SET status='ISSUED',invoice_code=$3,issue_date=CURRENT_DATE,
          issued_at=clock_timestamp(),issued_by_principal_id=$4,tax_snapshot_id=$5,
          tax_snapshot_version=1,tax_status='CALCULATED'
         WHERE tenant_id=$1 AND id=$2`,
        [tenantId,invoiceId,"INV-PH-"+suffix,randomUUID(),snapshot.rows[0]!.id],
      );
      await client.query("COMMIT");
      return invoiceId;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  beforeAll(async () => {
    if (!adminUrl) throw new Error("TEST_DATABASE_URL is required for payments HTTP integration tests");
    adminPool = new Pool({connectionString:adminUrl,max:4});
    const insertPrincipal = async (code:string, secret:string):Promise<string> => {
      const id = randomUUID();
      const credentialHash = createHash("sha256").update(secret,"utf8").digest("hex");
      await adminPool.query(
        `INSERT INTO public.finance_integration_principals
          (id,principal_code,display_name,credential_hash,allowed_scopes,status)
         VALUES ($1,$2,$3,$4,$5,'ACTIVE')`,
        [id,code,"Payments HTTP integration test",credentialHash,scopes],
      );
      await adminPool.query(
        "INSERT INTO public.finance_integration_tenant_grants (principal_id,tenant_id,granted_by) VALUES ($1,$2,'integration-test')",
        [id,tenantId],
      );
      return id;
    };
    principalA = await insertPrincipal(principalCodeA,secretA);
    principalB = await insertPrincipal(principalCodeB,secretB);

    server = app.listen(0,"127.0.0.1");
    await new Promise<void>((resolve,reject) => {
      server.once("listening",resolve);
      server.once("error",reject);
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    if (server?.listening) await new Promise<void>((resolve,reject) =>
      server.close((error) => error ? reject(error) : resolve()));
    if (adminPool) {
      if (principalA || principalB) {
        await adminPool.query(
          "DELETE FROM public.finance_integration_principals WHERE id = ANY($1::uuid[])",
          [[principalA,principalB].filter(Boolean)],
        );
      }
      await adminPool.end();
    }
  });

  it("rejects unauthenticated payment creation, refund requests and balance reads", async () => {
    const payment = await fetch(`${baseUrl}/api/v1/payments`, {
      method:"POST",headers:{"content-type":"application/json"},
      body:JSON.stringify({amount:"100",currencyCode:"XOF",source:"MANUAL",method:"CASH"}),
    });
    expect(payment.status).toBe(401);
    await expect(payment.json()).resolves.toMatchObject({error:{code:"UNAUTHENTICATED"}});

    const refund = await fetch(`${baseUrl}/api/v1/payments/11111111-1111-4111-8111-111111111111/refunds`, {
      method:"POST",headers:{"content-type":"application/json","Idempotency-Key":"refund-http-no-auth"},
      body:JSON.stringify({amount:"10",reason:"Duplicate transfer"}),
    });
    expect(refund.status).toBe(401);
    await expect(refund.json()).resolves.toMatchObject({error:{code:"UNAUTHENTICATED"}});

    const balance = await fetch(`${baseUrl}/api/v1/invoices/11111111-1111-4111-8111-111111111111/balance`);
    expect(balance.status).toBe(401);
    await expect(balance.json()).resolves.toMatchObject({error:{code:"UNAUTHENTICATED"}});
  });

  it("creates, confirms, allocates, refunds and reads balances through authenticated API routes", async () => {
    const invoiceId = await seedIssuedInvoice("90");
    const create = await fetch(`${baseUrl}/api/v1/payments`,{
      method:"POST",headers:headers(principalCodeA,secretA,"payment-http-create-"+randomUUID()),
      body:JSON.stringify({amount:"100",currencyCode:"XOF",source:"MANUAL",method:"CASH",externalReference:"HTTP-MM-001"}),
    });
    expect(create.status).toBe(201);
    const createBody = await create.json() as {data:{payment:{id:string;status:string}}};
    const paymentId = createBody.data.payment.id;
    expect(createBody.data.payment.status).toBe("PENDING");

    const confirm = await fetch(`${baseUrl}/api/v1/payments/${paymentId}/confirm-manual`,{
      method:"POST",headers:headers(principalCodeA,secretA,"payment-http-confirm-"+randomUUID()),
    });
    expect(confirm.status).toBe(200);
    const confirmBody = await confirm.json() as {data:{payment:{status:string}}};
    expect(confirmBody.data.payment.status).toBe("CONFIRMED");

    const allocation = await fetch(`${baseUrl}/api/v1/payments/${paymentId}/allocations`,{
      method:"POST",headers:headers(principalCodeA,secretA,"payment-http-allocate-"+randomUUID()),
      body:JSON.stringify({invoiceId,amount:"90"}),
    });
    expect(allocation.status).toBe(201);

    const balance = await fetch(`${baseUrl}/api/v1/invoices/${invoiceId}/balance`,{
      headers:headers(principalCodeA,secretA),
    });
    expect(balance.status).toBe(200);
    const balanceBody = await balance.json() as {data:{balance:{allocatedAmount:string;remainingBalance:string}}};
    expect(balanceBody.data.balance.allocatedAmount).toBe("90.00000000");
    expect(balanceBody.data.balance.remainingBalance).toBe("0.00000000");

    const requestRefund = await fetch(`${baseUrl}/api/v1/payments/${paymentId}/refunds`,{
      method:"POST",headers:headers(principalCodeA,secretA,"payment-http-refund-"+randomUUID()),
      body:JSON.stringify({amount:"10",reason:"Customer overpayment"}),
    });
    expect(requestRefund.status).toBe(201);
    const refundBody = await requestRefund.json() as {data:{refund:{id:string;status:string}}};
    const refundId = refundBody.data.refund.id;
    expect(refundBody.data.refund.status).toBe("REQUESTED");

    const selfApprove = await fetch(`${baseUrl}/api/v1/payments/${paymentId}/refunds/${refundId}/approve`,{
      method:"POST",headers:headers(principalCodeA,secretA,"payment-http-self-approve-"+randomUUID()),
    });
    expect(selfApprove.status).toBe(403);
    await expect(selfApprove.json()).resolves.toMatchObject({error:{code:"REFUND_SELF_APPROVAL_FORBIDDEN"}});

    const approve = await fetch(`${baseUrl}/api/v1/payments/${paymentId}/refunds/${refundId}/approve`,{
      method:"POST",headers:headers(principalCodeB,secretB,"payment-http-approve-"+randomUUID()),
    });
    expect(approve.status).toBe(200);
    const approveBody = await approve.json() as {data:{refund:{status:string}}};
    expect(approveBody.data.refund.status).toBe("APPROVED");

    const completeRefund = await fetch(`${baseUrl}/api/v1/payments/${paymentId}/refunds/${refundId}/record-manual-success`,{
      method:"POST",headers:headers(principalCodeB,secretB,"payment-http-refund-complete-"+randomUUID()),
      body:JSON.stringify({externalReference:"CASH-REFUND-001"}),
    });
    expect(completeRefund.status).toBe(200);
    const completedBody = await completeRefund.json() as {data:{refund:{status:string}}};
    expect(completedBody.data.refund.status).toBe("SUCCEEDED");

    const payments = await fetch(`${baseUrl}/api/v1/payments?limit=10`,{
      headers:headers(principalCodeA,secretA),
    });
    expect(payments.status).toBe(200);
    const paymentsBody = await payments.json() as {data:{payments:Array<{id:string}>}};
    expect(paymentsBody.data.payments.some((payment) => payment.id===paymentId)).toBe(true);
  });
});
