import type { PoolClient } from "pg";
import type { CalculatedInvoiceTotals } from "../types/invoice-calculation.types.js";
import type { CreateInvoiceDraftInput, ListInvoiceDraftsQuery } from "../validators/invoice-draft.schema.js";

export interface FinanceInvoice {
  id: string;
  customerId: string;
  invoiceCode: string | null;
  status: "DRAFT" | "ISSUED" | "CANCELLED";
  currencyCode: string;
  currencyMinorUnit: number;
  issueDate: string | null;
  dueDate: string | null;
  customerSnapshot: Record<string, unknown>;
  subtotal: string;
  discountTotal: string;
  taxableTotal: string;
  taxTotal: string;
  grandTotal: string;
  calculationPolicy: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  lines: Array<{
    id: string; lineNumber: number; description: string; quantity: string;
    unitPrice: string; discountPercent: string; taxRatePercent: string;
    subtotal: string; discountAmount: string; taxableAmount: string; taxAmount: string; total: string;
  }>;
}

interface InvoiceRow {
  id: string; customer_id: string; invoice_code: string | null; status: "DRAFT" | "ISSUED" | "CANCELLED";
  currency_code: string; currency_minor_unit: number; issue_date: string | null; due_date: string | null;
  customer_snapshot: Record<string, unknown>; subtotal: string; discount_total: string; taxable_total: string;
  tax_total: string; grand_total: string; calculation_policy: string; notes: string | null;
  created_at: Date; updated_at: Date;
}
interface LineRow {
  id: string; line_number: number; description: string; quantity: string; unit_price: string;
  discount_percent: string; tax_rate_percent: string; subtotal: string; discount_amount: string;
  taxable_amount: string; tax_amount: string; total: string;
}
const invoiceColumns = `id, customer_id, invoice_code, status, currency_code, currency_minor_unit,
  issue_date, due_date, customer_snapshot, subtotal::text, discount_total::text, taxable_total::text,
  tax_total::text, grand_total::text, calculation_policy, notes, created_at, updated_at`;

async function attachLines(client: PoolClient, tenantId: string, row: InvoiceRow): Promise<FinanceInvoice> {
  const result = await client.query<LineRow>(
    `SELECT id, line_number, description, quantity::text, unit_price::text, discount_percent::text,
      tax_rate_percent::text, subtotal::text, discount_amount::text, taxable_amount::text,
      tax_amount::text, total::text
     FROM public.finance_invoice_lines WHERE tenant_id = $1 AND invoice_id = $2 ORDER BY line_number`,
    [tenantId, row.id],
  );
  return {
    id: row.id, customerId: row.customer_id, invoiceCode: row.invoice_code, status: row.status,
    currencyCode: row.currency_code.trim(), currencyMinorUnit: row.currency_minor_unit,
    issueDate: row.issue_date,
    dueDate: row.due_date,
    customerSnapshot: row.customer_snapshot, subtotal: row.subtotal, discountTotal: row.discount_total,
    taxableTotal: row.taxable_total, taxTotal: row.tax_total, grandTotal: row.grand_total,
    calculationPolicy: row.calculation_policy, notes: row.notes,
    createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
    lines: result.rows.map((line) => ({
      id: line.id, lineNumber: line.line_number, description: line.description, quantity: line.quantity,
      unitPrice: line.unit_price, discountPercent: line.discount_percent, taxRatePercent: line.tax_rate_percent,
      subtotal: line.subtotal, discountAmount: line.discount_amount, taxableAmount: line.taxable_amount,
      taxAmount: line.tax_amount, total: line.total,
    })),
  };
}

export const invoiceRepository = {
  async createDraft(
    client: PoolClient, tenantId: string, principalId: string, input: CreateInvoiceDraftInput,
    currencyMinorUnit: number, totals: CalculatedInvoiceTotals,
    calculatedLines: readonly { subtotal: string; discountAmount: string; taxableAmount: string; taxAmount: string; total: string; quantity: string; unitPrice: string; discountPercent: string; taxRatePercent: string }[],
    customer: { id: string; legalName: string; displayName: string | null; email: string | null; phone: string | null; countryCode: string; taxIdentifier: string | null; registrationIdentifier: string | null },
  ): Promise<FinanceInvoice> {
    const created = await client.query<InvoiceRow>(
      `INSERT INTO public.finance_invoices (
        tenant_id, customer_id, currency_code, currency_minor_unit, due_date, customer_snapshot,
        subtotal, discount_total, taxable_total, tax_total, grand_total, calculation_policy, notes,
        created_by_principal_id
      ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING ${invoiceColumns}`,
      [tenantId, customer.id, totals.currency, currencyMinorUnit, input.dueDate ?? null,
        JSON.stringify({ id: customer.id, legalName: customer.legalName, displayName: customer.displayName,
          email: customer.email, phone: customer.phone, countryCode: customer.countryCode,
          taxIdentifier: customer.taxIdentifier, registrationIdentifier: customer.registrationIdentifier }),
        totals.subtotal, totals.discountTotal, totals.taxableTotal, totals.taxTotal, totals.grandTotal,
        totals.calculationPolicy, input.notes ?? null, principalId],
    );
    const invoice = created.rows[0];
    if (!invoice) throw new Error("INVOICE_INSERT_RETURNED_NO_ROW");
    for (let i = 0; i < input.lines.length; i += 1) {
      const source = input.lines[i]!;
      const calculated = calculatedLines[i]!;
      await client.query(
        `INSERT INTO public.finance_invoice_lines (
          tenant_id, invoice_id, line_number, description, quantity, unit_price, discount_percent,
          tax_rate_percent, subtotal, discount_amount, taxable_amount, tax_amount, total
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [tenantId, invoice.id, i + 1, source.description, calculated.quantity, calculated.unitPrice,
          calculated.discountPercent, calculated.taxRatePercent, calculated.subtotal,
          calculated.discountAmount, calculated.taxableAmount, calculated.taxAmount, calculated.total],
      );
    }
    return attachLines(client, tenantId, invoice);
  },


  async updateDraft(
    client: PoolClient,
    tenantId: string,
    invoiceId: string,
    expectedUpdatedAt: string,
    input: CreateInvoiceDraftInput,
    currencyMinorUnit: number,
    totals: CalculatedInvoiceTotals,
    calculatedLines: readonly { subtotal: string; discountAmount: string; taxableAmount: string; taxAmount: string; total: string; quantity: string; unitPrice: string; discountPercent: string; taxRatePercent: string }[],
    customer: { id: string; legalName: string; displayName: string | null; email: string | null; phone: string | null; countryCode: string; taxIdentifier: string | null; registrationIdentifier: string | null },
  ): Promise<FinanceInvoice | null> {
    const updated = await client.query<InvoiceRow>(
      `UPDATE public.finance_invoices
          SET customer_id = $4,
              currency_code = $5,
              currency_minor_unit = $6,
              due_date = $7,
              customer_snapshot = $8::jsonb,
              subtotal = $9,
              discount_total = $10,
              taxable_total = $11,
              tax_total = $12,
              grand_total = $13,
              calculation_policy = $14,
              notes = $15,
              updated_at = now()
        WHERE tenant_id = $1
          AND id = $2
          AND status = 'DRAFT'
          AND updated_at = $3::timestamptz
      RETURNING ${invoiceColumns}`,
      [tenantId, invoiceId, expectedUpdatedAt, customer.id, totals.currency, currencyMinorUnit,
        input.dueDate ?? null,
        JSON.stringify({ id: customer.id, legalName: customer.legalName, displayName: customer.displayName,
          email: customer.email, phone: customer.phone, countryCode: customer.countryCode,
          taxIdentifier: customer.taxIdentifier, registrationIdentifier: customer.registrationIdentifier }),
        totals.subtotal, totals.discountTotal, totals.taxableTotal, totals.taxTotal, totals.grandTotal,
        totals.calculationPolicy, input.notes ?? null],
    );
    const invoice = updated.rows[0];
    if (!invoice) return null;

    await client.query(
      "DELETE FROM public.finance_invoice_lines WHERE tenant_id = $1 AND invoice_id = $2",
      [tenantId, invoiceId],
    );
    for (let i = 0; i < input.lines.length; i += 1) {
      const source = input.lines[i]!;
      const calculated = calculatedLines[i]!;
      await client.query(
        `INSERT INTO public.finance_invoice_lines (
          tenant_id, invoice_id, line_number, description, quantity, unit_price, discount_percent,
          tax_rate_percent, subtotal, discount_amount, taxable_amount, tax_amount, total
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [tenantId, invoiceId, i + 1, source.description, calculated.quantity, calculated.unitPrice,
          calculated.discountPercent, calculated.taxRatePercent, calculated.subtotal,
          calculated.discountAmount, calculated.taxableAmount, calculated.taxAmount, calculated.total],
      );
    }
    return attachLines(client, tenantId, invoice);
  },

  async findById(client: PoolClient, tenantId: string, invoiceId: string): Promise<FinanceInvoice | null> {
    const found = await client.query<InvoiceRow>(
      `SELECT ${invoiceColumns} FROM public.finance_invoices WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
      [tenantId, invoiceId],
    );
    return found.rows[0] ? attachLines(client, tenantId, found.rows[0]) : null;
  },

  async list(client: PoolClient, tenantId: string, query: ListInvoiceDraftsQuery): Promise<FinanceInvoice[]> {
    const found = await client.query<InvoiceRow>(
      `SELECT ${invoiceColumns} FROM public.finance_invoices
       WHERE tenant_id = $1
         AND ($2::text IS NULL OR status = $2)
         AND (
           $3::uuid IS NULL
           OR (created_at, id) < (
             SELECT cursor_invoice.created_at, cursor_invoice.id
               FROM public.finance_invoices AS cursor_invoice
              WHERE cursor_invoice.tenant_id = $1
                AND cursor_invoice.id = $3::uuid
           )
         )
       ORDER BY created_at DESC, id DESC LIMIT $4`,
      [tenantId, query.status ?? null, query.cursor ?? null, query.limit],
    );
    const invoices: FinanceInvoice[] = [];
    for (const row of found.rows) invoices.push(await attachLines(client, tenantId, row));
    return invoices;
  },
};
