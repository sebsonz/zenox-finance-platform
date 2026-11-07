import type { PoolClient } from "pg";
import type { CalculatedInvoiceTotals } from "../types/invoice-calculation.types.js";
import type { FinanceInvoiceOperationContext } from "../types/invoice-operation-context.js";
import { invoiceActor, isUserInvoiceContext } from "../types/invoice-operation-context.js";
import type { CreateInvoiceDraftInput, ListInvoiceDraftsQuery, UpdateInvoiceDraftInput } from "../validators/invoice-draft.schema.js";

export interface FinanceInvoice {
  id: string;
  customerId: string;
  invoiceCode: string | null;
  status: "DRAFT" | "ISSUED" | "CANCELLED";
  documentType: "STANDARD" | "DEPOSIT" | "BALANCE";
  contractTotal: string | null;
  relatedInvoiceId: string | null;
  currencyCode: string;
  currencyMinorUnit: number;
  issueDate: string | null;
  dueDate: string | null;
  purchaseOrderReference: string | null;
  serviceDate: string | null;
  paymentTerms: string | null;
  paymentInstructions: string | null;
  externalReference: string | null;
  footerNote: string | null;
  issuerSnapshot?: Record<string, unknown>;
  customerSnapshot: Record<string, unknown>;
  subtotal: string;
  discountTotal: string;
  taxableTotal: string;
  taxTotal: string;
  grandTotal: string;
  amountDue: string;
  calculationPolicy: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  documentVersion: number;
  taxSnapshotId: string | null;
  taxSnapshotVersion: number | null;
  taxStatus: "PROVISIONAL" | "CALCULATED" | "REVIEW_REQUIRED";
  lines: Array<{
    id: string; lineNumber: number; description: string; quantity: string;
    unitPrice: string; discountPercent: string; taxRatePercent: string;
    subtotal: string; discountAmount: string; taxableAmount: string; taxAmount: string; total: string;
  }>;
}

interface InvoiceRow {
  id: string; customer_id: string; invoice_code: string | null; status: "DRAFT" | "ISSUED" | "CANCELLED";
  document_type: "STANDARD" | "DEPOSIT" | "BALANCE"; contract_total: string | null; related_invoice_id: string | null;
  currency_code: string; currency_minor_unit: number; issue_date: string | null; due_date: string | null;
  purchase_order_reference: string | null; service_date: string | null; payment_terms: string | null;
  payment_instructions: string | null; external_reference: string | null; footer_note: string | null;
  issuer_snapshot: Record<string, unknown>; customer_snapshot: Record<string, unknown>; subtotal: string; discount_total: string; taxable_total: string;
  tax_total: string; grand_total: string; amount_due: string; calculation_policy: string; notes: string | null;
  created_at: string; updated_at: string; document_version: number;
  tax_snapshot_id: string | null; tax_snapshot_version: number | null;
  tax_status: "PROVISIONAL" | "CALCULATED" | "REVIEW_REQUIRED";
}
interface LineRow {
  id: string; line_number: number; description: string; quantity: string; unit_price: string;
  discount_percent: string; tax_rate_percent: string; subtotal: string; discount_amount: string;
  taxable_amount: string; tax_amount: string; total: string;
}
const invoiceColumns = `id, customer_id, invoice_code, status, document_type, contract_total::text, related_invoice_id, currency_code, currency_minor_unit,
  issue_date, due_date, purchase_order_reference, service_date, payment_terms, payment_instructions,
  external_reference, footer_note, issuer_snapshot, customer_snapshot, subtotal::text, discount_total::text, taxable_total::text,
  tax_total::text, grand_total::text, amount_due::text, calculation_policy, notes,
  to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at,
  to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at,
  document_version, tax_snapshot_id, tax_snapshot_version, tax_status`;

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
    documentType: row.document_type, contractTotal: row.contract_total, relatedInvoiceId: row.related_invoice_id,
    currencyCode: row.currency_code.trim(), currencyMinorUnit: row.currency_minor_unit,
    issueDate: row.issue_date,
    dueDate: row.due_date,
    purchaseOrderReference: row.purchase_order_reference,
    serviceDate: row.service_date,
    paymentTerms: row.payment_terms,
    paymentInstructions: row.payment_instructions,
    externalReference: row.external_reference,
    footerNote: row.footer_note,
    issuerSnapshot: row.issuer_snapshot, customerSnapshot: row.customer_snapshot, subtotal: row.subtotal, discountTotal: row.discount_total,
    taxableTotal: row.taxable_total, taxTotal: row.tax_total, grandTotal: row.grand_total, amountDue: row.amount_due,
    calculationPolicy: row.calculation_policy, notes: row.notes,
    createdAt: row.created_at, updatedAt: row.updated_at,
    documentVersion: row.document_version, taxSnapshotId: row.tax_snapshot_id,
    taxSnapshotVersion: row.tax_snapshot_version, taxStatus: row.tax_status,
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
    client: PoolClient, context: FinanceInvoiceOperationContext, input: CreateInvoiceDraftInput,
    currencyMinorUnit: number, totals: CalculatedInvoiceTotals,
    calculatedLines: readonly { subtotal: string; discountAmount: string; taxableAmount: string; taxAmount: string; total: string; quantity: string; unitPrice: string; discountPercent: string; taxRatePercent: string }[],
    customer: { id: string; customerType: "BUSINESS" | "INDIVIDUAL"; legalName: string; displayName: string | null; email: string | null; phone: string | null; countryCode: string; taxIdentifier: string | null; registrationIdentifier: string | null; addressLine1: string | null; addressLine2: string | null; addressRegion: string | null; addressCity: string | null; addressPostalCode: string | null },
    issuerSnapshot: Record<string, unknown>,
  ): Promise<FinanceInvoice> {
    const actor = invoiceActor(context);
    const legacyPrincipalId = isUserInvoiceContext(context) ? null : context.principal.id;
    const created = await client.query<InvoiceRow>(
      `INSERT INTO public.finance_invoices (
        tenant_id, customer_id, currency_code, currency_minor_unit, due_date,
        purchase_order_reference, service_date, payment_terms, payment_instructions, external_reference, footer_note,
        issuer_snapshot, customer_snapshot, subtotal, discount_total, taxable_total, tax_total, grand_total, amount_due, calculation_policy, notes,
        created_by_principal_id, created_by_actor_type, created_by_actor_ref,
        updated_by_actor_type, updated_by_actor_ref, document_type, contract_total, related_invoice_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29)
      RETURNING ${invoiceColumns}`,
      [context.tenantId, customer.id, totals.currency, currencyMinorUnit, input.dueDate ?? null,
        input.purchaseOrderReference ?? null, input.serviceDate ?? null, input.paymentTerms ?? null,
        input.paymentInstructions ?? null, input.externalReference ?? null, input.footerNote ?? null,
        JSON.stringify(issuerSnapshot),
        JSON.stringify({ id: customer.id, customerType: customer.customerType, legalName: customer.legalName, displayName: customer.displayName,
          address: customer.addressLine1, addressLine2: customer.addressLine2, region: customer.addressRegion,
          city: customer.addressCity, postalCode: customer.addressPostalCode,
          email: customer.email, phone: customer.phone, countryCode: customer.countryCode,
          taxIdentifier: customer.taxIdentifier, registrationIdentifier: customer.registrationIdentifier }),
        totals.subtotal, totals.discountTotal, totals.taxableTotal, totals.taxTotal, totals.grandTotal,
        totals.grandTotal, totals.calculationPolicy, input.notes ?? null, legacyPrincipalId, actor.type, actor.ref, actor.type, actor.ref,
        input.documentType, input.contractTotal ?? null, input.relatedInvoiceId ?? null],
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
        [context.tenantId, invoice.id, i + 1, source.description, calculated.quantity, calculated.unitPrice,
          calculated.discountPercent, calculated.taxRatePercent, calculated.subtotal,
          calculated.discountAmount, calculated.taxableAmount, calculated.taxAmount, calculated.total],
      );
    }
    return attachLines(client, context.tenantId, invoice);
  },


  async updateDraft(
    client: PoolClient,
    context: FinanceInvoiceOperationContext,
    invoiceId: string,
    expectedUpdatedAt: string,
    input: UpdateInvoiceDraftInput,
    currencyMinorUnit: number,
    totals: CalculatedInvoiceTotals,
    calculatedLines: readonly { subtotal: string; discountAmount: string; taxableAmount: string; taxAmount: string; total: string; quantity: string; unitPrice: string; discountPercent: string; taxRatePercent: string }[],
    customer: { id: string; customerType: "BUSINESS" | "INDIVIDUAL"; legalName: string; displayName: string | null; email: string | null; phone: string | null; countryCode: string; taxIdentifier: string | null; registrationIdentifier: string | null; addressLine1: string | null; addressLine2: string | null; addressRegion: string | null; addressCity: string | null; addressPostalCode: string | null },
    issuerSnapshot: Record<string, unknown>,
  ): Promise<FinanceInvoice | null> {
    const actor = invoiceActor(context);
    const updated = await client.query<InvoiceRow>(
      `UPDATE public.finance_invoices
          SET customer_id = $3,
              currency_code = $4,
              currency_minor_unit = $5,
              due_date = $6,
              purchase_order_reference = $7,
              service_date = $8,
              payment_terms = $9,
              payment_instructions = $10,
              external_reference = $11,
              footer_note = $12,
              issuer_snapshot = $13::jsonb,
              customer_snapshot = $14::jsonb,
              subtotal = $15,
              discount_total = $16,
              taxable_total = $17,
              tax_total = $18,
              grand_total = $19,
              amount_due = $19,
              calculation_policy = $20,
              notes = $21,
              document_type = $22,
              contract_total = $23,
              related_invoice_id = $24,
              document_version = document_version + 1,
              tax_snapshot_id = NULL,
              tax_snapshot_version = NULL,
              tax_status = 'PROVISIONAL',
              updated_by_actor_type = $25,
              updated_by_actor_ref = $26,
              updated_at = clock_timestamp()
        WHERE tenant_id = $1
          AND id = $2
          AND status = 'DRAFT'
          AND updated_at = $27::timestamptz
      RETURNING ${invoiceColumns}`,
      [context.tenantId, invoiceId, customer.id, totals.currency, currencyMinorUnit,
        input.dueDate ?? null, input.purchaseOrderReference ?? null, input.serviceDate ?? null,
        input.paymentTerms ?? null, input.paymentInstructions ?? null, input.externalReference ?? null,
        input.footerNote ?? null,
        JSON.stringify(issuerSnapshot),
        JSON.stringify({ id: customer.id, customerType: customer.customerType, legalName: customer.legalName, displayName: customer.displayName,
          address: customer.addressLine1, addressLine2: customer.addressLine2, region: customer.addressRegion,
          city: customer.addressCity, postalCode: customer.addressPostalCode,
          email: customer.email, phone: customer.phone, countryCode: customer.countryCode,
          taxIdentifier: customer.taxIdentifier, registrationIdentifier: customer.registrationIdentifier }),
        totals.subtotal, totals.discountTotal, totals.taxableTotal, totals.taxTotal, totals.grandTotal,
        totals.calculationPolicy, input.notes ?? null, input.documentType, input.contractTotal ?? null,
        input.relatedInvoiceId ?? null, actor.type, actor.ref, expectedUpdatedAt],
    );
    const invoice = updated.rows[0];
    if (!invoice) return null;

    await client.query(
      "DELETE FROM public.finance_invoice_lines WHERE tenant_id = $1 AND invoice_id = $2",
      [context.tenantId, invoiceId],
    );
    for (let i = 0; i < input.lines.length; i += 1) {
      const source = input.lines[i]!;
      const calculated = calculatedLines[i]!;
      await client.query(
        `INSERT INTO public.finance_invoice_lines (
          tenant_id, invoice_id, line_number, description, quantity, unit_price, discount_percent,
          tax_rate_percent, subtotal, discount_amount, taxable_amount, tax_amount, total
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [context.tenantId, invoiceId, i + 1, source.description, calculated.quantity, calculated.unitPrice,
          calculated.discountPercent, calculated.taxRatePercent, calculated.subtotal,
          calculated.discountAmount, calculated.taxableAmount, calculated.taxAmount, calculated.total],
      );
    }
    return attachLines(client, context.tenantId, invoice);
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
           $3::text IS NULL
           OR invoice_code ILIKE '%' || $3 || '%'
           OR external_reference ILIKE '%' || $3 || '%'
           OR purchase_order_reference ILIKE '%' || $3 || '%'
           OR customer_snapshot->>'legalName' ILIKE '%' || $3 || '%'
           OR customer_snapshot->>'displayName' ILIKE '%' || $3 || '%'
         )
         AND (
           $4::uuid IS NULL
           OR (created_at, id) < (
             SELECT cursor_invoice.created_at, cursor_invoice.id
               FROM public.finance_invoices AS cursor_invoice
              WHERE cursor_invoice.tenant_id = $1
                AND cursor_invoice.id = $4::uuid
           )
         )
       ORDER BY created_at DESC, id DESC LIMIT $5`,
      [tenantId, query.status ?? null, query.search ?? null, query.cursor ?? null, query.limit],
    );
    const invoices: FinanceInvoice[] = [];
    for (const row of found.rows) invoices.push(await attachLines(client, tenantId, row));
    return invoices;
  },
};
