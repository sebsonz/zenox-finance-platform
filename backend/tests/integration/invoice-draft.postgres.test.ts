import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { invoiceDraftService } from "../../src/modules/invoices/services/invoice-draft.service.js";

const adminUrl = process.env["TEST_DATABASE_URL"];
const runtimeUrl = process.env["TEST_RUNTIME_DATABASE_URL"];
const integrationDescribe = adminUrl && runtimeUrl ? describe : describe.skip;
const tenantA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const tenantB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

integrationDescribe("PostgreSQL invoice draft tenant isolation", () => {
  let adminPool: Pool;
  let runtimePool: Pool;

  beforeAll(() => {
    adminPool = new Pool({ connectionString: adminUrl, max: 2 });
    runtimePool = new Pool({ connectionString: runtimeUrl, max: 2 });
  });

  afterAll(async () => {
    await Promise.all([adminPool?.end(), runtimePool?.end()]);
  });

  async function seedCustomer(tenantId: string, code: string): Promise<string> {
    const client = await adminPool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
      const result = await client.query<{ id: string }>(
        `INSERT INTO public.finance_customers
          (tenant_id, customer_code, customer_type, legal_name, country_code, status)
         VALUES ($1, $2, 'BUSINESS', 'Invoice Integration Customer', 'BJ', 'ACTIVE')
         RETURNING id`,
        [tenantId, code],
      );
      await client.query("COMMIT");
      return result.rows[0]!.id;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  it("updates only an existing DRAFT when the expected updated_at matches", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
    const customerId = await seedCustomer(tenantA, `EDIT_${suffix}`);
    const invoiceId = randomUUID();
    const admin = await adminPool.connect();
    let originalUpdatedAt = "";
    try {
      await admin.query("BEGIN");
      await admin.query("SELECT set_config('app.tenant_id', $1, true)", [tenantA]);
      const inserted = await admin.query<{ updated_at: string }>(
        `INSERT INTO public.finance_invoices
          (id, tenant_id, customer_id, status, currency_code, currency_minor_unit, customer_snapshot,
           subtotal, discount_total, taxable_total, tax_total, grand_total, calculation_policy, notes)
         VALUES ($1,$2,$3,'DRAFT','XOF',0,'{"legalName":"Original"}'::jsonb,100,0,100,0,100,'LINE_HALF_UP_TAX_EXCLUSIVE_V1','Original')
         RETURNING updated_at::text AS updated_at`,
        [invoiceId, tenantA, customerId],
      );
      originalUpdatedAt = inserted.rows[0]!.updated_at;
      await admin.query(
        `INSERT INTO public.finance_invoice_lines
          (tenant_id, invoice_id, line_number, description, quantity, unit_price, discount_percent,
           tax_rate_percent, subtotal, discount_amount, taxable_amount, tax_amount, total)
         VALUES ($1,$2,1,'Original line',1,100,0,0,100,0,100,0,100)`,
        [tenantA, invoiceId],
      );
      await admin.query("COMMIT");
    } catch (error) {
      await admin.query("ROLLBACK");
      throw error;
    } finally {
      admin.release();
    }

    const editor = await runtimePool.connect();
    try {
      await editor.query("BEGIN");
      await editor.query("SELECT set_config('app.tenant_id', $1, true)", [tenantA]);
      const updated = await editor.query<{ id: string; notes: string; updated_at: string }>(
        `UPDATE public.finance_invoices
            SET notes = 'Updated notes', updated_at = now() + interval '1 second'
          WHERE tenant_id = $1 AND id = $2 AND status = 'DRAFT' AND updated_at = $3::timestamptz
          RETURNING id, notes, updated_at::text AS updated_at`,
        [tenantA, invoiceId, originalUpdatedAt],
      );
      expect(updated.rowCount).toBe(1);
      expect(updated.rows[0]?.notes).toBe("Updated notes");
      const changedVersion = updated.rows[0]!.updated_at;
      const staleRetry = await editor.query(
        `UPDATE public.finance_invoices
            SET notes = 'Stale overwrite'
          WHERE tenant_id = $1 AND id = $2 AND status = 'DRAFT' AND updated_at = $3::timestamptz
          RETURNING id`,
        [tenantA, invoiceId, originalUpdatedAt],
      );
      expect(staleRetry.rowCount).toBe(0);

      const snapshot = await editor.query<{ id: string }>(
        `INSERT INTO public.finance_tax_calculation_snapshots
          (tenant_id, document_type, document_id, document_version, calculation_policy,
           engine_version, tax_date, currency_code, currency_minor_unit, input_snapshot,
           result_snapshot, applied_rules_snapshot)
         VALUES ($1,'INVOICE',$2,1,'INVOICE_TAX_SNAPSHOT_PER_LINE_V1','integration-test',
                 CURRENT_DATE,'XOF',0,'{"fixture":"draft-test"}'::jsonb,
                 '{"taxTotal":"0"}'::jsonb,'[]'::jsonb)
         RETURNING id`,
        [tenantA, invoiceId],
      );
      await editor.query(
        `UPDATE public.finance_invoices
            SET tax_snapshot_id = $3, tax_snapshot_version = 1, tax_status = 'CALCULATED'
          WHERE tenant_id = $1 AND id = $2`,
        [tenantA, invoiceId, snapshot.rows[0]!.id],
      );
      const issued = await editor.query(
        `UPDATE public.finance_invoices
            SET status = 'ISSUED', invoice_code = 'INV-TEST-01', issue_date = CURRENT_DATE,
                issued_at = clock_timestamp(), issued_by_principal_id = $3
          WHERE tenant_id = $1 AND id = $2 RETURNING id`,
        [tenantA, invoiceId, randomUUID()],
      );
      expect(issued.rowCount).toBe(1);
      const editAfterIssue = await editor.query(
        `UPDATE public.finance_invoices SET notes = 'Must not change'
          WHERE tenant_id = $1 AND id = $2 AND status = 'DRAFT' AND updated_at = $3::timestamptz
          RETURNING id`,
        [tenantA, invoiceId, changedVersion],
      );
      expect(editAfterIssue.rowCount).toBe(0);
      await editor.query("ROLLBACK");
    } catch (error) {
      await editor.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      editor.release();
    }
  });

  it("isolates invoice and line reads by transaction tenant and fails closed without context", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
    const customerA = await seedCustomer(tenantA, `IA_${suffix}`);
    const customerB = await seedCustomer(tenantB, `IB_${suffix}`);
    const invoiceA = randomUUID();
    const invoiceB = randomUUID();
    const lineA = randomUUID();
    const lineB = randomUUID();

    const admin = await adminPool.connect();
    try {
      await admin.query("BEGIN");
      await admin.query("SELECT set_config('app.tenant_id', $1, true)", [tenantA]);
      await admin.query(
        `INSERT INTO public.finance_invoices
          (id, tenant_id, customer_id, status, currency_code, currency_minor_unit, customer_snapshot,
           subtotal, discount_total, taxable_total, tax_total, grand_total, calculation_policy)
         VALUES ($1,$2,$3,'DRAFT','XOF',0,'{"legalName":"A"}'::jsonb,100,0,100,0,100,'LINE_HALF_UP_TAX_EXCLUSIVE_V1')`,
        [invoiceA, tenantA, customerA],
      );
      await admin.query(
        `INSERT INTO public.finance_invoice_lines
          (id, tenant_id, invoice_id, line_number, description, quantity, unit_price, discount_percent,
           tax_rate_percent, subtotal, discount_amount, taxable_amount, tax_amount, total)
         VALUES ($1,$2,$3,1,'Line A',1,100,0,0,100,0,100,0,100)`,
        [lineA, tenantA, invoiceA],
      );
      await admin.query("COMMIT");
    } catch (error) {
      await admin.query("ROLLBACK");
      throw error;
    } finally {
      admin.release();
    }

    const adminB = await adminPool.connect();
    try {
      await adminB.query("BEGIN");
      await adminB.query("SELECT set_config('app.tenant_id', $1, true)", [tenantB]);
      await adminB.query(
        `INSERT INTO public.finance_invoices
          (id, tenant_id, customer_id, status, currency_code, currency_minor_unit, customer_snapshot,
           subtotal, discount_total, taxable_total, tax_total, grand_total, calculation_policy)
         VALUES ($1,$2,$3,'DRAFT','XOF',0,'{"legalName":"B"}'::jsonb,200,0,200,0,200,'LINE_HALF_UP_TAX_EXCLUSIVE_V1')`,
        [invoiceB, tenantB, customerB],
      );
      await adminB.query(
        `INSERT INTO public.finance_invoice_lines
          (id, tenant_id, invoice_id, line_number, description, quantity, unit_price, discount_percent,
           tax_rate_percent, subtotal, discount_amount, taxable_amount, tax_amount, total)
         VALUES ($1,$2,$3,1,'Line B',1,200,0,0,200,0,200,0,200)`,
        [lineB, tenantB, invoiceB],
      );
      await adminB.query("COMMIT");
    } catch (error) {
      await adminB.query("ROLLBACK");
      throw error;
    } finally {
      adminB.release();
    }

    const client = await runtimePool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantA]);
      const own = await client.query("SELECT id FROM public.finance_invoices WHERE id = $1", [invoiceA]);
      const foreign = await client.query("SELECT id FROM public.finance_invoices WHERE id = $1", [invoiceB]);
      const ownLines = await client.query("SELECT id FROM public.finance_invoice_lines WHERE invoice_id = $1", [invoiceA]);
      const foreignLines = await client.query("SELECT id FROM public.finance_invoice_lines WHERE invoice_id = $1", [invoiceB]);
      const ownCustomer = await client.query("SELECT id FROM public.finance_customers WHERE id = $1", [customerA]);
      const foreignCustomer = await client.query("SELECT id FROM public.finance_customers WHERE id = $1", [customerB]);
      expect(own.rowCount).toBe(1);
      expect(foreign.rowCount).toBe(0);
      expect(ownLines.rowCount).toBe(1);
      expect(foreignLines.rowCount).toBe(0);
      expect(ownCustomer.rowCount).toBe(1);
      expect(foreignCustomer.rowCount).toBe(0);
      await client.query("ROLLBACK");

      await client.query("BEGIN");
      const withoutContext = await client.query("SELECT id FROM public.finance_invoices");
      const linesWithoutContext = await client.query("SELECT id FROM public.finance_invoice_lines");
      const customersWithoutContext = await client.query("SELECT id FROM public.finance_customers");
      expect(withoutContext.rowCount).toBe(0);
      expect(linesWithoutContext.rowCount).toBe(0);
      expect(customersWithoutContext.rowCount).toBe(0);
      await client.query("ROLLBACK");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });

  it("creates and updates a user-authored draft with truthful actor fields and atomic audit events", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
    const customerId = await seedCustomer(tenantA, `USER_DRAFT_${suffix}`);
    const actorRef = "https://auth.example.test|invoice-draft-user";
    const context = {
      tenantId: tenantA,
      correlationId: `user-draft-${suffix}`,
      actor: {
        type: "USER" as const,
        ref: actorRef,
        membershipId: randomUUID(),
        identityIssuer: "https://auth.example.test",
        identitySubject: "invoice-draft-user",
      },
    };
    const created = await invoiceDraftService.create(context, {
      customerId,
      currencyCode: "XOF",
      notes: "User-created draft",
      lines: [{ description: "Freight", quantity: "2", unitPrice: "1000", discountPercent: "0", taxRatePercent: "0" }],
    });

    const saved = await adminPool.query<{
      created_by_principal_id: string | null; created_by_actor_type: string | null; created_by_actor_ref: string | null;
      updated_by_actor_type: string | null; updated_by_actor_ref: string | null;
    }>(
      `SELECT created_by_principal_id, created_by_actor_type, created_by_actor_ref,
              updated_by_actor_type, updated_by_actor_ref
         FROM public.finance_invoices WHERE tenant_id = $1 AND id = $2`,
      [tenantA, created.id],
    );
    expect(saved.rows[0]).toMatchObject({
      created_by_principal_id: null,
      created_by_actor_type: "USER",
      created_by_actor_ref: actorRef,
      updated_by_actor_type: "USER",
      updated_by_actor_ref: actorRef,
    });

    const updated = await invoiceDraftService.updateDraft(context, created.id, {
      customerId,
      currencyCode: "XOF",
      expectedUpdatedAt: created.updatedAt,
      notes: "User-updated draft",
      lines: [{ description: "Freight", quantity: "3", unitPrice: "1000", discountPercent: "0", taxRatePercent: "0" }],
    });
    expect(updated.notes).toBe("User-updated draft");

    const audit = await adminPool.query<{ action: string; actor_type: string; actor_ref: string }>(
      `SELECT action, actor_type, actor_ref FROM public.finance_audit_events
        WHERE tenant_id = $1 AND resource_id = $2 AND action IN ('invoice.draft.created','invoice.draft.updated')
        ORDER BY action`,
      [tenantA, created.id],
    );
    expect(audit.rows).toHaveLength(2);
    expect(audit.rows.every((row) => row.actor_type === "USER" && row.actor_ref === actorRef)).toBe(true);
  });
});
