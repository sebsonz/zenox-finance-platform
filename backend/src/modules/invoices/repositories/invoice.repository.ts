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
  currencyCode: string;
  currencyMinorUnit: number;
  issueDate: string | null;
  dueDate: string | null;
  customerSnapshot: Record<string, unknown>;
  sellerSnapshot: Record<string, unknown>;
  subtotal: string;
  discountTotal: string;
  taxableTotal: string;
  taxTotal: string;
  grandTotal: string;
  amountDue: string;
  calculationPolicy: string;
  notes: string | null;
  document: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  documentVersion: number;
  taxSnapshotId: string | null;
  taxSnapshotVersion: number | null;
  taxStatus: "PROVISIONAL" | "CALCULATED" | "REVIEW_REQUIRED";
  lines: Array<{
    id: string; lineNumber: number; description: string; lineType: "ITEM"|"SERVICE"|"FEE"|"EXPENSE"; itemCode: string | null; unit: string | null; lineNote: string | null; quantity: string;
    unitPrice: string; discountPercent: string; taxRatePercent: string;
    subtotal: string; discountAmount: string; taxableAmount: string; taxAmount: string; total: string;
  }>;
}

interface InvoiceRow {
  id: string; customer_id: string; invoice_code: string | null; status: "DRAFT" | "ISSUED" | "CANCELLED";
  currency_code: string; currency_minor_unit: number; issue_date: string | null; due_date: string | null;
  customer_snapshot: Record<string, unknown>; seller_snapshot: Record<string, unknown>; subtotal: string; discount_total: string; taxable_total: string;
  tax_total: string; grand_total: string; amount_due: string; calculation_policy: string; notes: string | null;
  created_at: string; updated_at: string; document_version: number;
  tax_snapshot_id: string | null; tax_snapshot_version: number | null;
  tax_status: "PROVISIONAL" | "CALCULATED" | "REVIEW_REQUIRED";
  document_metadata: Record<string, unknown>;
}
interface LineRow {
  id: string; line_number: number; description: string; line_type: "ITEM"|"SERVICE"|"FEE"|"EXPENSE"; item_code: string | null; unit_label: string | null; line_note: string | null; quantity: string; unit_price: string;
  discount_percent: string; tax_rate_percent: string; subtotal: string; discount_amount: string;
  taxable_amount: string; tax_amount: string; total: string;
}
const invoiceColumns = `id, customer_id, invoice_code, status, currency_code, currency_minor_unit,
  issue_date, due_date, customer_snapshot, seller_snapshot, subtotal::text, discount_total::text, taxable_total::text,
  tax_total::text, grand_total::text, amount_due::text, calculation_policy, notes,
  to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at,
  to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at,
  document_version, tax_snapshot_id, tax_snapshot_version, tax_status, document_metadata`;


async function buildSellerSnapshot(client: PoolClient, tenantId: string): Promise<Record<string, unknown>> {
  const result = await client.query<Record<string, unknown>>(
    `SELECT t.legal_name, t.tenant_code, t.country_code, p.trade_name, p.website_url,
            p.general_email, p.general_phone, a.address_line1, a.address_line2,
            a.city, a.region, a.postal_code, a.country_code AS address_country_code
       FROM public.finance_tenants t
       LEFT JOIN public.finance_tenant_profiles p ON p.tenant_id = t.id
       LEFT JOIN LATERAL (
         SELECT address_line1, address_line2, city, region, postal_code, country_code
           FROM public.finance_tenant_addresses
          WHERE tenant_id = t.id AND status = 'ACTIVE'
          ORDER BY (address_type = 'REGISTERED') DESC, is_primary DESC, valid_from DESC
          LIMIT 1
       ) a ON true
      WHERE t.id = $1 LIMIT 1`, [tenantId],
  );
  const row = result.rows[0];
  if (!row) throw new Error("INVOICE_ISSUER_TENANT_NOT_FOUND");
  return {
    legalName: row.legal_name, tradeName: row.trade_name, tenantCode: row.tenant_code,
    countryCode: row.country_code, website: row.website_url, email: row.general_email,
    phone: row.general_phone,
    address: row.address_line1 ? {
      line1: row.address_line1, line2: row.address_line2, city: row.city,
      region: row.region, postalCode: row.postal_code, countryCode: row.address_country_code,
    } : null,
  };
}
async function buildCustomerSnapshot(client: PoolClient, tenantId: string, customer: {
  id: string; legalName: string; displayName: string | null; email: string | null; phone: string | null;
  countryCode: string; taxIdentifier: string | null; registrationIdentifier: string | null;
}): Promise<Record<string, unknown>> {
  const result = await client.query<Record<string, unknown>>(
    `SELECT address_type, recipient_name, address_line1, address_line2, city, region, postal_code, country_code
       FROM public.finance_customer_addresses
      WHERE tenant_id = $1 AND customer_id = $2 AND status = 'ACTIVE'
      ORDER BY (address_type = 'BILLING') DESC, is_primary DESC, created_at DESC LIMIT 1`,
    [tenantId, customer.id],
  );
  const address = result.rows[0];
  return {
    id: customer.id, legalName: customer.legalName, displayName: customer.displayName,
    email: customer.email, phone: customer.phone, countryCode: customer.countryCode,
    taxIdentifier: customer.taxIdentifier, registrationIdentifier: customer.registrationIdentifier,
    address: address ? {
      type: address.address_type, recipientName: address.recipient_name,
      line1: address.address_line1, line2: address.address_line2, city: address.city,
      region: address.region, postalCode: address.postal_code, countryCode: address.country_code,
    } : null,
  };
}

async function attachLines(client: PoolClient, tenantId: string, row: InvoiceRow): Promise<FinanceInvoice> {
  const result = await client.query<LineRow>(
    `SELECT id, line_number, description, line_type, item_code, unit_label, line_note, quantity::text, unit_price::text,
      discount_percent::text, tax_rate_percent::text, subtotal::text, discount_amount::text, taxable_amount::text,
      tax_amount::text, total::text
     FROM public.finance_invoice_lines WHERE tenant_id = $1 AND invoice_id = $2 ORDER BY line_number`,
    [tenantId, row.id],
  );
  return {
    id: row.id, customerId: row.customer_id, invoiceCode: row.invoice_code, status: row.status,
    currencyCode: row.currency_code.trim(), currencyMinorUnit: row.currency_minor_unit,
    issueDate: row.issue_date,
    dueDate: row.due_date,
    customerSnapshot: row.customer_snapshot, sellerSnapshot: row.seller_snapshot ?? {}, subtotal: row.subtotal, discountTotal: row.discount_total,
    taxableTotal: row.taxable_total, taxTotal: row.tax_total, grandTotal: row.grand_total, amountDue: row.amount_due,
    calculationPolicy: row.calculation_policy, notes: row.notes, document: row.document_metadata ?? {},
    createdAt: row.created_at, updatedAt: row.updated_at,
    documentVersion: row.document_version, taxSnapshotId: row.tax_snapshot_id,
    taxSnapshotVersion: row.tax_snapshot_version, taxStatus: row.tax_status,
    lines: result.rows.map((line) => ({
      id: line.id, lineNumber: line.line_number, description: line.description, lineType: line.line_type, itemCode: line.item_code, unit: line.unit_label, lineNote: line.line_note, quantity: line.quantity,
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
    customer: { id: string; legalName: string; displayName: string | null; email: string | null; phone: string | null; countryCode: string; taxIdentifier: string | null; registrationIdentifier: string | null },
  ): Promise<FinanceInvoice> {
    const actor = invoiceActor(context);
    const legacyPrincipalId = isUserInvoiceContext(context) ? null : context.principal.id;
    const sellerSnapshot = await buildSellerSnapshot(client, context.tenantId);
    const customerSnapshot = await buildCustomerSnapshot(client, context.tenantId, customer);
    const created = await client.query<InvoiceRow>(
      `INSERT INTO public.finance_invoices (
        tenant_id, customer_id, currency_code, currency_minor_unit, due_date, customer_snapshot, seller_snapshot,
        subtotal, discount_total, taxable_total, tax_total, grand_total, amount_due, calculation_policy, notes, document_metadata,
        created_by_principal_id, created_by_actor_type, created_by_actor_ref,
        updated_by_actor_type, updated_by_actor_ref
      ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17,$18,$19,$20,$21)
      RETURNING ${invoiceColumns}`,
      [context.tenantId, customer.id, totals.currency, currencyMinorUnit, input.dueDate ?? null,
        JSON.stringify(customerSnapshot), JSON.stringify(sellerSnapshot),
        totals.subtotal, totals.discountTotal, totals.taxableTotal, totals.taxTotal, totals.grandTotal,
        totals.grandTotal, totals.calculationPolicy, input.notes ?? null, JSON.stringify(input.document ?? {}), legacyPrincipalId, actor.type, actor.ref, actor.type, actor.ref],
    );
    const invoice = created.rows[0];
    if (!invoice) throw new Error("INVOICE_INSERT_RETURNED_NO_ROW");
    for (let i = 0; i < input.lines.length; i += 1) {
      const source = input.lines[i]!;
      const calculated = calculatedLines[i]!;
      await client.query(
        `INSERT INTO public.finance_invoice_lines (
          tenant_id, invoice_id, line_number, description, line_type, item_code, unit_label, line_note, quantity, unit_price, discount_percent,
          tax_rate_percent, subtotal, discount_amount, taxable_amount, tax_amount, total
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [context.tenantId, invoice.id, i + 1, source.description, source.lineType ?? "ITEM", source.itemCode ?? null, source.unit ?? null, source.lineNote ?? null, calculated.quantity, calculated.unitPrice,
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
    customer: { id: string; legalName: string; displayName: string | null; email: string | null; phone: string | null; countryCode: string; taxIdentifier: string | null; registrationIdentifier: string | null },
  ): Promise<FinanceInvoice | null> {
    const actor = invoiceActor(context);
    const sellerSnapshot = await buildSellerSnapshot(client, context.tenantId);
    const customerSnapshot = await buildCustomerSnapshot(client, context.tenantId, customer);
    const updated = await client.query<InvoiceRow>(
      `UPDATE public.finance_invoices
          SET customer_id = $3,
              currency_code = $4,
              currency_minor_unit = $5,
              due_date = $6,
              customer_snapshot = $7::jsonb,
              seller_snapshot = $8::jsonb,
              subtotal = $9,
              discount_total = $10,
              taxable_total = $11,
              tax_total = $12,
              grand_total = $13,
              amount_due = $13,
              calculation_policy = $14,
              notes = $15,
              document_metadata = $16::jsonb,
              document_version = document_version + 1,
              tax_snapshot_id = NULL,
              tax_snapshot_version = NULL,
              tax_status = 'PROVISIONAL',
              updated_by_actor_type = $17,
              updated_by_actor_ref = $18,
              updated_at = clock_timestamp()
        WHERE tenant_id = $1
          AND id = $2
          AND status = 'DRAFT'
          AND updated_at = $19::timestamptz
      RETURNING ${invoiceColumns}`,
      [context.tenantId, invoiceId, customer.id, totals.currency, currencyMinorUnit,
        input.dueDate ?? null,
        JSON.stringify(customerSnapshot), JSON.stringify(sellerSnapshot),
        totals.subtotal, totals.discountTotal, totals.taxableTotal, totals.taxTotal, totals.grandTotal,
        totals.calculationPolicy, input.notes ?? null, JSON.stringify(input.document ?? {}), actor.type, actor.ref, expectedUpdatedAt],
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
          tenant_id, invoice_id, line_number, description, item_code, unit_label, line_note, quantity, unit_price, discount_percent,
          tax_rate_percent, subtotal, discount_amount, taxable_amount, tax_amount, total
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [context.tenantId, invoiceId, i + 1, source.description, source.itemCode ?? null, source.unit ?? null, source.lineNote ?? null, calculated.quantity, calculated.unitPrice,
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
