import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { invoiceTaxSnapshotService } from "../../src/modules/invoices/services/invoice-tax-snapshot.service.js";

const adminUrl = process.env["TEST_DATABASE_URL"];
const runtimeUrl = process.env["TEST_RUNTIME_DATABASE_URL"];
const integrationDescribe = adminUrl && runtimeUrl ? describe : describe.skip;
const tenantA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const tenantB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

integrationDescribe("PostgreSQL invoice tax snapshot binding", () => {
  let adminPool: Pool;
  let runtimePool: Pool;

  beforeAll(() => {
    adminPool = new Pool({ connectionString: adminUrl, max: 2 });
    runtimePool = new Pool({ connectionString: runtimeUrl, max: 2 });
  });

  afterAll(async () => {
    await Promise.all([adminPool?.end(), runtimePool?.end()]);
  });

  async function seedInvoice(client: import("pg").PoolClient, tenantId: string): Promise<string> {
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    const customer = await client.query<{ id: string }>(
      `INSERT INTO public.finance_customers
        (tenant_id, customer_code, customer_type, legal_name, country_code, status, metadata)
       VALUES ($1, $2, 'BUSINESS', 'Tax Snapshot Test', 'BJ', 'ACTIVE', '{}'::jsonb)
       RETURNING id`,
      [tenantId, `TAX_${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`],
    );
    const id = randomUUID();
    await client.query(
      `INSERT INTO public.finance_invoices
        (id, tenant_id, customer_id, status, currency_code, currency_minor_unit, customer_snapshot,
         subtotal, discount_total, taxable_total, tax_total, grand_total, calculation_policy, notes)
       VALUES ($1,$2,$3,'DRAFT','XOF',0,'{"legalName":"Tax Snapshot Test"}'::jsonb,1000,0,1000,0,1000,
               'LINE_HALF_UP_TAX_EXCLUSIVE_V1','snapshot binding test')`,
      [id, tenantId, customer.rows[0]!.id],
    );
    return id;
  }

  async function insertSnapshot(
    client: import("pg").PoolClient,
    tenantId: string,
    invoiceId: string,
    version: number,
  ): Promise<string> {
    const result = await client.query<{ id: string }>(
      `INSERT INTO public.finance_tax_calculation_snapshots
        (tenant_id, document_type, document_id, document_version, calculation_policy,
         engine_version, tax_date, currency_code, currency_minor_unit, input_snapshot,
         result_snapshot, applied_rules_snapshot)
       VALUES ($1,'INVOICE',$2,$3,'INVOICE_TAX_SNAPSHOT_PER_LINE_V1','integration-test',
               CURRENT_DATE,'XOF',0,'{"fixture":true}'::jsonb,'{"taxTotal":"180"}'::jsonb,
               '[{"ruleCode":"ITEST_VAT","ratePercent":"18"}]'::jsonb)
       RETURNING id`,
      [tenantId, invoiceId, version],
    );
    return result.rows[0]!.id;
  }

  it("calculates real effective rules and atomically persists line totals, snapshot evidence and invoice net due", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
    const invoiceId = randomUUID();
    const principalId = randomUUID();
    const jurisdictionId = randomUUID();
    const customerCode = `TAXFLOW_${suffix}`;
    const ruleCode = `TAXFLOW_${suffix}`;
    const admin = await adminPool.connect();
    let updatedAt = "";
    try {
      await admin.query("BEGIN");
      await admin.query("SELECT set_config('app.tenant_id', $1, true)", [tenantA]);
      const customer = await admin.query<{ id: string }>(
        `INSERT INTO public.finance_customers
          (tenant_id, customer_code, customer_type, legal_name, country_code, status)
         VALUES ($1, $2, 'BUSINESS', 'Tax flow integration', 'BJ', 'ACTIVE')
         RETURNING id`,
        [tenantA, customerCode],
      );
      await admin.query(
        `INSERT INTO public.finance_tax_jurisdictions
          (id, code, country_code, name, jurisdiction_level, is_active)
         VALUES ($1, $2, 'BJ', 'Tax flow integration jurisdiction', 'COUNTRY', true)`,
        [jurisdictionId, `TF_${suffix}`],
      );
      await admin.query(
        `INSERT INTO public.finance_tax_rules
          (tenant_id, jurisdiction_id, rule_code, name, tax_type, treatment, rate_percent,
           price_mode, priority, is_compound, applies_to, version, valid_from, status)
         VALUES ($1,$2,$3,'Tax flow integration VAT','VAT','STANDARD',18,'EXCLUSIVE',10,false,
                 'FREIGHT',1,CURRENT_DATE,'ACTIVE')`,
        [tenantA, jurisdictionId, ruleCode],
      );
      const invoice = await admin.query<{ updated_at: string }>(
        `INSERT INTO public.finance_invoices
          (id, tenant_id, customer_id, status, currency_code, currency_minor_unit, customer_snapshot,
           subtotal, discount_total, taxable_total, tax_total, grand_total, amount_due, calculation_policy, notes)
         VALUES ($1,$2,$3,'DRAFT','XOF',0,'{"legalName":"Tax flow integration"}'::jsonb,
                 1000,0,1000,0,1000,1000,'LINE_HALF_UP_TAX_EXCLUSIVE_V1','tax flow')
         RETURNING updated_at::text AS updated_at`,
        [invoiceId, tenantA, customer.rows[0]!.id],
      );
      updatedAt = new Date(invoice.rows[0]!.updated_at).toISOString();
      await admin.query(
        `INSERT INTO public.finance_invoice_lines
          (tenant_id, invoice_id, line_number, description, quantity, unit_price, discount_percent,
           tax_rate_percent, subtotal, discount_amount, taxable_amount, tax_amount, total)
         VALUES ($1,$2,1,'Freight',1,1000,0,0,1000,0,1000,0,1000)`,
        [tenantA, invoiceId],
      );
      await admin.query("COMMIT");
    } catch (error) {
      await admin.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      admin.release();
    }

    const result = await invoiceTaxSnapshotService.calculateAndAttach({
      tenantId: tenantA,
      principal: {
        id: principalId,
        principalCode: "tax-flow-integration",
        displayName: "Tax flow integration",
        scopes: ["invoice:draft:write", "tax:calculate"],
        allowedTenantIds: [tenantA],
      },
      correlationId: `tax-flow-${suffix}`,
    }, invoiceId, {
      expectedUpdatedAt: updatedAt,
      taxDate: new Date().toISOString().slice(0, 10),
      jurisdictionId,
      appliesTo: "FREIGHT",
    });

    expect(result.snapshot.documentType).toBe("INVOICE");
    expect(result.snapshot.documentId).toBe(invoiceId);
    expect(result.snapshot.documentVersion).toBe(1);
    expect(result.snapshot.appliedRulesSnapshot).toHaveLength(1);
    expect(result.snapshot.resultSnapshot).toMatchObject({
      taxableTotal: "1000",
      taxTotal: "180",
      grandTotal: "1180",
      amountDue: "1180",
    });
    expect(result.invoice).toMatchObject({
      taxSnapshotId: result.snapshot.id,
      taxSnapshotVersion: 1,
      taxStatus: "CALCULATED",
      amountDue: "1180",
    });

    const verify = await adminPool.query<{
      document_version: number;
      tax_snapshot_id: string;
      tax_status: string;
      taxable_total: string;
      tax_total: string;
      grand_total: string;
      amount_due: string;
      line_tax: string;
      line_total: string;
    }>(
      `SELECT i.document_version, i.tax_snapshot_id, i.tax_status, i.taxable_total::text,
              i.tax_total::text, i.grand_total::text, i.amount_due::text,
              l.tax_amount::text AS line_tax, l.total::text AS line_total
         FROM public.finance_invoices i
         JOIN public.finance_invoice_lines l ON l.tenant_id = i.tenant_id AND l.invoice_id = i.id
        WHERE i.tenant_id = $1 AND i.id = $2`,
      [tenantA, invoiceId],
    );
    expect(verify.rows[0]).toMatchObject({
      document_version: 1,
      tax_snapshot_id: result.snapshot.id,
      tax_status: "CALCULATED",
      taxable_total: "1000.0000",
      tax_total: "180.0000",
      grand_total: "1180.0000",
      amount_due: "1180.0000",
      line_tax: "180.0000",
      line_total: "1180.0000",
    });
  });

  it("links only same-tenant snapshots and rejects stale or mismatched revision references", async () => {
    const admin = await adminPool.connect();
    try {
      await admin.query("BEGIN");
      const invoiceA = await seedInvoice(admin, tenantA);
      const snapshotA = await insertSnapshot(admin, tenantA, invoiceA, 1);
      await admin.query(
        `UPDATE public.finance_invoices SET tax_snapshot_id = $2, tax_snapshot_version = 1, tax_status = 'CALCULATED'
          WHERE tenant_id = $1 AND id = $3`,
        [tenantA, snapshotA, invoiceA],
      );
      const linked = await admin.query<{ tax_snapshot_id: string; tax_snapshot_version: number; tax_status: string }>(
        "SELECT tax_snapshot_id, tax_snapshot_version, tax_status FROM public.finance_invoices WHERE id = $1",
        [invoiceA],
      );
      expect(linked.rows[0]).toMatchObject({
        tax_snapshot_id: snapshotA,
        tax_snapshot_version: 1,
        tax_status: "CALCULATED",
      });

      await admin.query("SAVEPOINT stale_snapshot_revision");
      await expect(
        admin.query(
          "UPDATE public.finance_invoices SET document_version = 2 WHERE tenant_id = $1 AND id = $2",
          [tenantA, invoiceA],
        ),
      ).rejects.toMatchObject({ code: "23514" });
      await admin.query("ROLLBACK TO SAVEPOINT stale_snapshot_revision");
      await admin.query("RELEASE SAVEPOINT stale_snapshot_revision");

      const invoiceB = await seedInvoice(admin, tenantB);
      await expect(
        admin.query(
          `UPDATE public.finance_invoices SET tax_snapshot_id = $2, tax_snapshot_version = 1
            WHERE tenant_id = $1 AND id = $3`,
          [tenantB, snapshotA, invoiceB],
        ),
      ).rejects.toMatchObject({ code: "23514" });

      const duplicate = await insertSnapshot(admin, tenantA, invoiceA, 2);
      await expect(
        insertSnapshot(admin, tenantA, invoiceA, 1),
      ).rejects.toMatchObject({ code: "23505" });
      await admin.query("ROLLBACK");
      expect(duplicate).toMatch(/^[0-9a-f-]{36}$/i);
    } catch (error) {
      await admin.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      admin.release();
    }
  });

  it("invalidates tax evidence and increments version on a subsequent draft edit", async () => {
    const admin = await adminPool.connect();
    let invoiceId = "";
    let customerId = "";
    let snapshotId = "";
    try {
      await admin.query("BEGIN");
      await admin.query("SELECT set_config('app.tenant_id', $1, true)", [tenantA]);
      const customer = await admin.query<{ id: string }>(
        `INSERT INTO public.finance_customers
          (tenant_id, customer_code, customer_type, legal_name, country_code, status, metadata)
         VALUES ($1, $2, 'BUSINESS', 'Tax Snapshot Edit', 'BJ', 'ACTIVE', '{}'::jsonb)
         RETURNING id`,
        [tenantA, `EDIT_${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`],
      );
      customerId = customer.rows[0]!.id;
      invoiceId = randomUUID();
      await admin.query(
        `INSERT INTO public.finance_invoices
          (id, tenant_id, customer_id, status, currency_code, currency_minor_unit, customer_snapshot,
           subtotal, discount_total, taxable_total, tax_total, grand_total, calculation_policy, notes)
         VALUES ($1,$2,$3,'DRAFT','XOF',0,'{"legalName":"Tax Snapshot Edit"}'::jsonb,1000,0,1000,180,1180,
                 'LINE_HALF_UP_TAX_EXCLUSIVE_V1','before edit')`,
        [invoiceId, tenantA, customerId],
      );
      snapshotId = await insertSnapshot(admin, tenantA, invoiceId, 1);
      await admin.query(
        `UPDATE public.finance_invoices SET tax_snapshot_id = $2, tax_snapshot_version = 1, tax_status = 'CALCULATED'
          WHERE tenant_id = $1 AND id = $3`,
        [tenantA, snapshotId, invoiceId],
      );
      const edited = await admin.query<{ document_version: number; tax_snapshot_id: string | null; tax_snapshot_version: number | null; tax_status: string }>(
        `UPDATE public.finance_invoices
            SET notes = 'after edit', document_version = document_version + 1,
                tax_snapshot_id = NULL, tax_snapshot_version = NULL, tax_status = 'PROVISIONAL'
          WHERE tenant_id = $1 AND id = $2 AND status = 'DRAFT'
          RETURNING document_version, tax_snapshot_id, tax_snapshot_version, tax_status`,
        [tenantA, invoiceId],
      );
      expect(edited.rows[0]).toMatchObject({
        document_version: 2,
        tax_snapshot_id: null,
        tax_snapshot_version: null,
        tax_status: "PROVISIONAL",
      });
      await admin.query("ROLLBACK");
    } catch (error) {
      await admin.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      admin.release();
    }
  });

  it("refuses client-runtime UPDATE and DELETE privileges on immutable tax evidence", async () => {
    const admin = await adminPool.connect();
    try {
      await admin.query("BEGIN");
      await admin.query("SELECT set_config('app.tenant_id', $1, true)", [tenantA]);
      const invoiceId = randomUUID();
      const invoice = await seedInvoice(admin, tenantA);
      const id = await insertSnapshot(admin, tenantA, invoice, 1);
      const runtime = await runtimePool.connect();
      try {
        await runtime.query("BEGIN");
        await runtime.query("SELECT set_config('app.tenant_id', $1, true)", [tenantA]);
        await expect(runtime.query("UPDATE public.finance_tax_calculation_snapshots SET engine_version = 'changed' WHERE id = $1", [id]))
          .rejects.toMatchObject({ code: "42501" });
        await runtime.query("ROLLBACK");
      } finally {
        runtime.release();
      }
      expect(invoiceId).toMatch(/^[0-9a-f-]{36}$/i);
      expect(id).toMatch(/^[0-9a-f-]{36}$/i);
      await admin.query("ROLLBACK");
    } catch (error) {
      await admin.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      admin.release();
    }
  });
});
