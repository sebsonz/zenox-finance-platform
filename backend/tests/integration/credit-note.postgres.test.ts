import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { invoiceIssuanceService } from "../../src/modules/invoices/services/invoice-issuance.service.js";
import { creditNoteService } from "../../src/modules/invoices/services/credit-note.service.js";

const databaseUrl = process.env["TEST_DATABASE_URL"];
const integrationDescribe = databaseUrl ? describe : describe.skip;
const tenantId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

integrationDescribe("PostgreSQL full-reversal credit notes", () => {
  let pool: Pool;
  beforeAll(() => { pool = new Pool({ connectionString: databaseUrl, max: 4 }); });
  afterAll(async () => { await pool?.end(); });

  async function seedDraft(client: PoolClient): Promise<{ id: string; updatedAt: string }> {
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    const customerCode = `CN_${randomUUID().replaceAll("-", "").slice(0, 14).toUpperCase()}`;
    const customer = await client.query<{ id: string }>(
      `INSERT INTO public.finance_customers
        (tenant_id, customer_code, customer_type, legal_name, country_code, status, metadata)
       VALUES ($1,$2,'BUSINESS','Credit note integration','BJ','ACTIVE','{}'::jsonb) RETURNING id`,
      [tenantId, customerCode],
    );
    const invoiceId = randomUUID();
    await client.query(
      `INSERT INTO public.finance_invoices
        (id,tenant_id,customer_id,status,currency_code,currency_minor_unit,customer_snapshot,
         subtotal,discount_total,taxable_total,tax_total,grand_total,amount_due,calculation_policy,notes)
       VALUES ($1,$2,$3,'DRAFT','XOF',0,'{"legalName":"Credit note integration","countryCode":"BJ"}'::jsonb,
               2000,0,2000,360,2360,2360,'LINE_HALF_UP_TAX_EXCLUSIVE_V1','credit note fixture')`,
      [invoiceId, tenantId, customer.rows[0]!.id],
    );
    await client.query(
      `INSERT INTO public.finance_invoice_lines
        (tenant_id,invoice_id,line_number,description,quantity,unit_price,discount_percent,tax_rate_percent,
         subtotal,discount_amount,taxable_amount,tax_amount,total)
       VALUES ($1,$2,1,'Freight',1,1000,0,18,1000,0,1000,180,1180),
              ($1,$2,2,'Handling',1,1000,0,18,1000,0,1000,180,1180)`,
      [tenantId, invoiceId],
    );
    const snapshot = await client.query<{ id: string }>(
      `INSERT INTO public.finance_tax_calculation_snapshots
        (tenant_id,document_type,document_id,document_version,calculation_policy,engine_version,tax_date,
         currency_code,currency_minor_unit,input_snapshot,result_snapshot,applied_rules_snapshot)
       VALUES ($1,'INVOICE',$2,1,'INVOICE_TAX_SNAPSHOT_PER_LINE_V1','credit-note-test',CURRENT_DATE,'XOF',0,
               '{"fixture":"credit-note"}'::jsonb,
               '{"taxableTotal":"2000","taxTotal":"360","grandTotal":"2360","amountDue":"2360"}'::jsonb,
               '[{"ruleCode":"BJ_VAT","treatment":"STANDARD","ratePercent":"18"}]'::jsonb)
       RETURNING id`,
      [tenantId, invoiceId],
    );
    await client.query(
      `UPDATE public.finance_invoices SET tax_snapshot_id=$3,tax_snapshot_version=1,tax_status='CALCULATED'
        WHERE tenant_id=$1 AND id=$2`,
      [tenantId, invoiceId, snapshot.rows[0]!.id],
    );
    const current = await client.query<{ updated_at: string }>(
      `SELECT to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at
         FROM public.finance_invoices WHERE tenant_id=$1 AND id=$2`,
      [tenantId, invoiceId],
    );
    return { id: invoiceId, updatedAt: current.rows[0]!.updated_at };
  }

  const context = () => ({
    tenantId,
    principal: { id: randomUUID(), principalCode: "credit-note-integration", displayName: "Credit note integration",
      scopes: ["invoice:issue", "invoice:credit"], allowedTenantIds: [tenantId] },
    correlationId: randomUUID(),
  });

  it("issues a full-reversal credit note without changing the original invoice", async () => {
    const client = await pool.connect();
    let draft: { id: string; updatedAt: string };
    try {
      await client.query("BEGIN");
      draft = await seedDraft(client);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally { client.release(); }

    const ctx = context();
    const original = await invoiceIssuanceService.issue(ctx, draft!.id, draft!.updatedAt, randomUUID());
    const credit = await creditNoteService.issueFullReversal(ctx, draft!.id, "Annulation commerciale complète");

    expect(original.status).toBe("ISSUED");
    expect(credit.status).toBe("ISSUED");
    expect(credit.creditNoteCode).toMatch(/^CN-\d{4}-\d{6}$/);
    expect(credit.originalInvoiceId).toBe(original.id);
    expect(credit.grandTotal).toBe(original.grandTotal);
    expect(credit.amountDue).toBe(original.amountDue);
    expect(credit.htmlSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(credit.pdfSha256).toMatch(/^[a-f0-9]{64}$/);

    const saved = await pool.query<{
      invoice_code: string; status: string; html_content: string; pdf_content: Buffer; lines_snapshot: unknown[];
    }>(
      `SELECT c.credit_note_code AS invoice_code, c.status, c.html_content, c.pdf_content, c.lines_snapshot
         FROM public.finance_credit_notes c WHERE c.tenant_id=$1 AND c.original_invoice_id=$2`,
      [tenantId, original.id],
    );
    expect(saved.rows).toHaveLength(1);
    expect(saved.rows[0]!.html_content).toContain("AVOIR");
    expect(saved.rows[0]!.html_content).toContain("Freight");
    expect(saved.rows[0]!.html_content).toContain("Handling");
    expect(saved.rows[0]!.pdf_content.subarray(0,8).toString("ascii")).toBe("%PDF-1.4");
    expect(saved.rows[0]!.pdf_content.toString("ascii")).toContain("AVOIR");
    expect(saved.rows[0]!.lines_snapshot).toHaveLength(2);

    await expect(creditNoteService.issueFullReversal(ctx, draft!.id, "Second attempt"))
      .rejects.toMatchObject({ code: "CREDIT_NOTE_ALREADY_EXISTS" });

    const unchanged = await pool.query<{ status: string; invoice_code: string }>(
      "SELECT status, invoice_code FROM public.finance_invoices WHERE tenant_id=$1 AND id=$2",
      [tenantId, original.id],
    );
    expect(unchanged.rows[0]).toEqual({ status: "ISSUED", invoice_code: original.invoiceCode });
  });

  it("rejects mutations of an issued credit note", async () => {
    const client = await pool.connect();
    let draft: { id: string; updatedAt: string };
    try {
      await client.query("BEGIN");
      draft = await seedDraft(client);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally { client.release(); }
    const ctx = context();
    await invoiceIssuanceService.issue(ctx, draft!.id, draft!.updatedAt, randomUUID());
    await creditNoteService.issueFullReversal(ctx, draft!.id, "Erreur de commande");

    const verify = await pool.connect();
    try {
      await verify.query("BEGIN");
      await verify.query("SELECT set_config('app.tenant_id',$1,true)", [tenantId]);
      await verify.query("SAVEPOINT credit_note_update");
      await expect(verify.query(
        "UPDATE public.finance_credit_notes SET reason='tampered' WHERE tenant_id=$1 AND original_invoice_id=$2",
        [tenantId, draft!.id],
      )).rejects.toMatchObject({ code: "55000" });
      await verify.query("ROLLBACK TO SAVEPOINT credit_note_update");
      await verify.query("ROLLBACK");
    } catch (error) {
      await verify.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally { verify.release(); }
  });

  it("attributes a user-issued credit note and its audit event to the real user actor", async () => {
    const client = await pool.connect();
    let draft: { id: string; updatedAt: string };
    try {
      await client.query("BEGIN");
      draft = await seedDraft(client);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally { client.release(); }

    await invoiceIssuanceService.issue(context(), draft!.id, draft!.updatedAt, randomUUID());
    const actorRef = "https://auth.example.test|credit-note-user";
    const userContext = {
      tenantId,
      correlationId: `user-credit-${randomUUID()}`,
      actor: {
        type: "USER" as const,
        ref: actorRef,
        membershipId: randomUUID(),
        identityIssuer: "https://auth.example.test",
        identitySubject: "credit-note-user",
      },
    };
    const credit = await creditNoteService.issueFullReversal(userContext, draft!.id, "Avoir intégral demandé par l’utilisateur");
    const result = await pool.query<{
      issued_by_principal_id: string | null;
      issued_by_actor_type: string | null;
      issued_by_actor_ref: string | null;
      audit_actor_type: string | null;
      audit_actor_ref: string | null;
    }>(
      `SELECT c.issued_by_principal_id, c.issued_by_actor_type, c.issued_by_actor_ref,
              a.actor_type AS audit_actor_type, a.actor_ref AS audit_actor_ref
         FROM public.finance_credit_notes c
         JOIN public.finance_audit_events a
           ON a.tenant_id = c.tenant_id AND a.resource_id = c.id AND a.action = 'invoice.credit_note.issued'
        WHERE c.tenant_id = $1 AND c.id = $2`,
      [tenantId, credit.id],
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toEqual({
      issued_by_principal_id: null,
      issued_by_actor_type: "USER",
      issued_by_actor_ref: actorRef,
      audit_actor_type: "USER",
      audit_actor_ref: actorRef,
    });
  });
});
