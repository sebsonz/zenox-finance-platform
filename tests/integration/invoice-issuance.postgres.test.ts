import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { invoiceIssuanceService } from "../../src/modules/invoices/services/invoice-issuance.service.js";

const databaseUrl = process.env["TEST_DATABASE_URL"];
const integrationDescribe = databaseUrl ? describe : describe.skip;
const tenantId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

integrationDescribe("PostgreSQL invoice issuance lifecycle", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = new Pool({ connectionString: databaseUrl, max: 5 });
  });

  afterAll(async () => {
    await pool?.end();
  });

  async function seedReadyDraft(client: PoolClient): Promise<{ id: string; updatedAt: string }> {
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    const suffix = randomUUID().replaceAll("-", "").slice(0, 14).toUpperCase();
    const customer = await client.query<{ id: string }>(
      `INSERT INTO public.finance_customers
        (tenant_id, customer_code, customer_type, legal_name, country_code, status, metadata)
       VALUES ($1, $2, 'BUSINESS', 'Issuance integration', 'BJ', 'ACTIVE', '{}'::jsonb)
       RETURNING id`,
      [tenantId, `ISSUE_${suffix}`],
    );
    const invoiceId = randomUUID();
    const inserted = await client.query<{ updated_at: string }>(
      `INSERT INTO public.finance_invoices
        (id, tenant_id, customer_id, status, currency_code, currency_minor_unit, customer_snapshot,
         subtotal, discount_total, taxable_total, tax_total, grand_total, amount_due, calculation_policy, notes)
       VALUES ($1,$2,$3,'DRAFT','XOF',0,'{"legalName":"Issuance integration"}'::jsonb,
               1000,0,1000,180,1180,1180,'LINE_HALF_UP_TAX_EXCLUSIVE_V1','issuance integration')
       RETURNING to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at`,
      [invoiceId, tenantId, customer.rows[0]!.id],
    );
    await client.query(
      `INSERT INTO public.finance_invoice_lines
        (tenant_id, invoice_id, line_number, description, quantity, unit_price, discount_percent,
         tax_rate_percent, subtotal, discount_amount, taxable_amount, tax_amount, total)
       VALUES ($1,$2,1,'Freight',1,1000,0,0,1000,0,1000,180,1180)`,
      [tenantId, invoiceId],
    );
    const snapshot = await client.query<{ id: string }>(
      `INSERT INTO public.finance_tax_calculation_snapshots
        (tenant_id, document_type, document_id, document_version, calculation_policy,
         engine_version, tax_date, currency_code, currency_minor_unit, input_snapshot,
         result_snapshot, applied_rules_snapshot)
       VALUES ($1,'INVOICE',$2,1,'INVOICE_TAX_SNAPSHOT_PER_LINE_V1','integration-test',
               CURRENT_DATE,'XOF',0,'{"fixture":"issuance"}'::jsonb,
               '{"taxableTotal":"1000","taxTotal":"180","grandTotal":"1180","amountDue":"1180"}'::jsonb,
               '[{"ruleCode":"ITEST_VAT","ratePercent":"18"}]'::jsonb)
       RETURNING id`,
      [tenantId, invoiceId],
    );
    await client.query(
      `UPDATE public.finance_invoices
          SET tax_snapshot_id = $3, tax_snapshot_version = 1, tax_status = 'CALCULATED'
        WHERE tenant_id = $1 AND id = $2`,
      [tenantId, invoiceId, snapshot.rows[0]!.id],
    );
    const current = await client.query<{ updated_at: string }>(
      `SELECT to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at
         FROM public.finance_invoices WHERE tenant_id = $1 AND id = $2`,
      [tenantId, invoiceId],
    );
    return { id: invoiceId, updatedAt: current.rows[0]?.updated_at ?? inserted.rows[0]!.updated_at };
  }

  it("allocates distinct invoice numbers concurrently and issues only tax-snapshotted drafts", async () => {
    const admin = await pool.connect();
    let first: { id: string; updatedAt: string };
    let second: { id: string; updatedAt: string };
    try {
      await admin.query("BEGIN");
      first = await seedReadyDraft(admin);
      second = await seedReadyDraft(admin);
      await admin.query("COMMIT");
    } catch (error) {
      await admin.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      admin.release();
    }

    const context = {
      tenantId,
      principal: {
        id: randomUUID(),
        principalCode: "invoice-issuance-integration",
        displayName: "Invoice issuance integration",
        scopes: ["invoice:issue"],
        allowedTenantIds: [tenantId],
      },
      correlationId: randomUUID(),
    };
    const [issuedFirst, issuedSecond] = await Promise.all([
      invoiceIssuanceService.issue(context, first!.id, first!.updatedAt),
      invoiceIssuanceService.issue(context, second!.id, second!.updatedAt),
    ]);

    expect(issuedFirst.status).toBe("ISSUED");
    expect(issuedSecond.status).toBe("ISSUED");
    expect(issuedFirst.invoiceCode).toMatch(/^INV-\d{4}-\d{6}$/);
    expect(issuedSecond.invoiceCode).toMatch(/^INV-\d{4}-\d{6}$/);
    expect(issuedFirst.invoiceCode).not.toBe(issuedSecond.invoiceCode);
    expect(issuedFirst.taxStatus).toBe("CALCULATED");
    expect(issuedSecond.taxStatus).toBe("CALCULATED");

    const verify = await pool.query<{
      status: string; invoice_code: string; issued_at: Date; tax_snapshot_id: string;
      artifact_id: string; content_sha256: string; html_content: string;
    }>(
      `SELECT i.status, i.invoice_code, i.issued_at, i.tax_snapshot_id,
              d.id AS artifact_id, d.content_sha256, d.html_content
         FROM public.finance_invoices i
         JOIN public.finance_invoice_document_artifacts d
           ON d.tenant_id = i.tenant_id AND d.invoice_id = i.id AND d.document_version = i.document_version
        WHERE i.tenant_id = $1 AND i.id = ANY($2::uuid[])
        ORDER BY i.invoice_code`,
      [tenantId, [first!.id, second!.id]],
    );
    expect(verify.rows).toHaveLength(2);
    expect(verify.rows.every((row) => row.status === "ISSUED" && row.issued_at instanceof Date && row.tax_snapshot_id)).toBe(true);
    for (const row of verify.rows) {
      expect(row.content_sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(row.html_content).toContain(row.invoice_code);
      expect(row.html_content).toContain(row.tax_snapshot_id);
      expect(row.artifact_id).toMatch(/^[0-9a-f-]{36}$/i);
    }
  });

  it("rejects direct database issuance when the authoritative tax snapshot is missing", async () => {
    const admin = await pool.connect();
    let draft: { id: string; updatedAt: string };
    try {
      await admin.query("BEGIN");
      draft = await seedReadyDraft(admin);
      await admin.query(
        `UPDATE public.finance_invoices
            SET tax_snapshot_id = NULL, tax_snapshot_version = NULL, tax_status = 'PROVISIONAL'
          WHERE tenant_id = $1 AND id = $2`,
        [tenantId, draft!.id],
      );
      await admin.query("SAVEPOINT issue_without_tax_evidence");
      await expect(
        admin.query(
          `UPDATE public.finance_invoices
              SET status = 'ISSUED', invoice_code = 'INV-INVALID-000001',
                  issue_date = CURRENT_DATE, issued_at = clock_timestamp(),
                  issued_by_principal_id = $3
            WHERE tenant_id = $1 AND id = $2`,
          [tenantId, draft!.id, randomUUID()],
        ),
      ).rejects.toMatchObject({ code: "23514" });
      await admin.query("ROLLBACK TO SAVEPOINT issue_without_tax_evidence");
      await admin.query("RELEASE SAVEPOINT issue_without_tax_evidence");
      await admin.query("ROLLBACK");
    } catch (error) {
      await admin.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      admin.release();
    }
  });

  it("blocks edits/deletes of issued invoices and mutations of their lines", async () => {
    const admin = await pool.connect();
    let draft: { id: string; updatedAt: string };
    try {
      await admin.query("BEGIN");
      draft = await seedReadyDraft(admin);
      await admin.query("COMMIT");
    } catch (error) {
      await admin.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      admin.release();
    }

    const context = {
      tenantId,
      principal: {
        id: randomUUID(),
        principalCode: "invoice-immutability-integration",
        displayName: "Invoice immutability integration",
        scopes: ["invoice:issue"],
        allowedTenantIds: [tenantId],
      },
      correlationId: randomUUID(),
    };
    await invoiceIssuanceService.issue(context, draft!.id, draft!.updatedAt);

    const verify = await pool.connect();
    try {
      await verify.query("BEGIN");
      await verify.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);

      await verify.query("SAVEPOINT issued_invoice_update");
      await expect(
        verify.query(
          "UPDATE public.finance_invoices SET notes = 'tampered' WHERE tenant_id = $1 AND id = $2",
          [tenantId, draft!.id],
        ),
      ).rejects.toMatchObject({ code: "55000" });
      await verify.query("ROLLBACK TO SAVEPOINT issued_invoice_update");
      await verify.query("RELEASE SAVEPOINT issued_invoice_update");

      await verify.query("SAVEPOINT issued_invoice_delete");
      await expect(
        verify.query("DELETE FROM public.finance_invoices WHERE tenant_id = $1 AND id = $2", [tenantId, draft!.id]),
      ).rejects.toMatchObject({ code: "55000" });
      await verify.query("ROLLBACK TO SAVEPOINT issued_invoice_delete");
      await verify.query("RELEASE SAVEPOINT issued_invoice_delete");

      await verify.query("SAVEPOINT issued_line_update");
      await expect(
        verify.query(
          "UPDATE public.finance_invoice_lines SET description = 'tampered' WHERE tenant_id = $1 AND invoice_id = $2",
          [tenantId, draft!.id],
        ),
      ).rejects.toMatchObject({ code: "55000" });
      await verify.query("ROLLBACK TO SAVEPOINT issued_line_update");
      await verify.query("RELEASE SAVEPOINT issued_line_update");

      await verify.query("SAVEPOINT issued_artifact_update");
      await expect(
        verify.query(
          `UPDATE public.finance_invoice_document_artifacts
              SET html_content = '<html>tampered</html>'
            WHERE tenant_id = $1 AND invoice_id = $2`,
          [tenantId, draft!.id],
        ),
      ).rejects.toMatchObject({ code: "55000" });
      await verify.query("ROLLBACK TO SAVEPOINT issued_artifact_update");
      await verify.query("RELEASE SAVEPOINT issued_artifact_update");

      await verify.query("ROLLBACK");
    } catch (error) {
      await verify.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      verify.release();
    }
  });
});
