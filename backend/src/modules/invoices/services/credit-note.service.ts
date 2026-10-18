import { createHash, randomUUID } from "node:crypto";
import { withTenantTransaction } from "../../../db/transaction.js";
import type { FinanceInvoiceOperationContext } from "../types/invoice-operation-context.js";
import { invoiceActor, isUserInvoiceContext } from "../types/invoice-operation-context.js";
import { recordInvoiceAudit } from "../repositories/invoice-audit.repository.js";
import { invoiceRepository } from "../repositories/invoice.repository.js";
import { renderInvoiceHtmlDocument } from "../documents/invoice-html-renderer.js";
import { renderInvoicePdfDocument } from "../documents/invoice-pdf-renderer.js";

export class CreditNoteServiceError extends Error {
  constructor(readonly code: "SOURCE_INVOICE_NOT_ISSUED" | "SOURCE_TAX_SNAPSHOT_MISSING" | "CREDIT_NOTE_ALREADY_EXISTS", message: string) {
    super(message);
    this.name = "CreditNoteServiceError";
  }
}
export interface FinanceCreditNote {
  id: string;
  originalInvoiceId: string;
  creditNoteCode: string;
  status: "ISSUED";
  reason: string;
  currencyCode: string;
  grandTotal: string;
  amountDue: string;
  htmlSha256: string;
  pdfSha256: string;
  issuedAt: string;
}

export const creditNoteService = {
  async listForInvoice(context: FinanceInvoiceOperationContext, invoiceId: string): Promise<Array<{
    id: string;
    originalInvoiceId: string;
    creditNoteCode: string;
    status: "ISSUED";
    reason: string;
    currencyCode: string;
    grandTotal: string;
    amountDue: string;
    htmlSha256: string;
    pdfSha256: string;
    issuedAt: string;
  }>> {
    return withTenantTransaction(context.tenantId, async (client) => {
      const result = await client.query<{
        id: string; original_invoice_id: string; credit_note_code: string; status: "ISSUED";
        reason: string; currency_code: string; grand_total: string; amount_due: string;
        html_sha256: string; pdf_sha256: string; issued_at: string;
      }>(
        `SELECT id, original_invoice_id, credit_note_code, status, reason, currency_code,
                grand_total::text, amount_due::text, html_sha256, pdf_sha256,
                to_char(issued_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS issued_at
           FROM public.finance_credit_notes
          WHERE tenant_id = $1 AND original_invoice_id = $2
          ORDER BY issued_at DESC`,
        [context.tenantId, invoiceId],
      );
      if (isUserInvoiceContext(context)) {
        await recordInvoiceAudit(client, context, "invoice.credit_note.listed", "INVOICE", invoiceId, {
          count: result.rows.length,
        });
      }
      return result.rows.map((row) => ({
        id: row.id,
        originalInvoiceId: row.original_invoice_id,
        creditNoteCode: row.credit_note_code,
        status: row.status,
        reason: row.reason,
        currencyCode: row.currency_code.trim(),
        grandTotal: row.grand_total,
        amountDue: row.amount_due,
        htmlSha256: row.html_sha256,
        pdfSha256: row.pdf_sha256,
        issuedAt: row.issued_at,
      }));
    });
  },

  async findDocument(context: FinanceInvoiceOperationContext, creditNoteId: string): Promise<{
    creditNoteCode: string; contentType: "text/html; charset=utf-8"; content: string; sha256: string;
  } | null> {
    return withTenantTransaction(context.tenantId, async (client) => {
      const result = await client.query<{ credit_note_code: string; html_content: string; html_sha256: string }>(
        `SELECT credit_note_code, html_content, html_sha256
           FROM public.finance_credit_notes WHERE tenant_id = $1 AND id = $2`,
        [context.tenantId, creditNoteId],
      );
      const row = result.rows[0];
      if (!row) return null;
      const hash = createHash("sha256").update(row.html_content, "utf8").digest("hex");
      if (hash !== row.html_sha256) throw new Error("CREDIT_NOTE_HTML_HASH_MISMATCH");
      if (isUserInvoiceContext(context)) {
        await recordInvoiceAudit(client, context, "invoice.credit_note.document.read", "CREDIT_NOTE", creditNoteId, {
          format: "HTML", creditNoteCode: row.credit_note_code, sha256: row.html_sha256,
        });
      }
      return { creditNoteCode: row.credit_note_code, contentType: "text/html; charset=utf-8", content: row.html_content, sha256: row.html_sha256 };
    });
  },

  async findPdf(context: FinanceInvoiceOperationContext, creditNoteId: string): Promise<{
    creditNoteCode: string; contentType: "application/pdf"; content: Buffer; sha256: string;
  } | null> {
    return withTenantTransaction(context.tenantId, async (client) => {
      const result = await client.query<{ credit_note_code: string; pdf_content: Buffer; pdf_sha256: string }>(
        `SELECT credit_note_code, pdf_content, pdf_sha256
           FROM public.finance_credit_notes WHERE tenant_id = $1 AND id = $2`,
        [context.tenantId, creditNoteId],
      );
      const row = result.rows[0];
      if (!row) return null;
      const hash = createHash("sha256").update(row.pdf_content).digest("hex");
      if (hash !== row.pdf_sha256) throw new Error("CREDIT_NOTE_PDF_HASH_MISMATCH");
      if (isUserInvoiceContext(context)) {
        await recordInvoiceAudit(client, context, "invoice.credit_note.document.read", "CREDIT_NOTE", creditNoteId, {
          format: "PDF", creditNoteCode: row.credit_note_code, sha256: row.pdf_sha256,
        });
      }
      return { creditNoteCode: row.credit_note_code, contentType: "application/pdf", content: row.pdf_content, sha256: row.pdf_sha256 };
    });
  },

  async issueFullReversal(context: FinanceInvoiceOperationContext, invoiceId: string, reason: string): Promise<FinanceCreditNote> {
    const actor = invoiceActor(context);
    const legacyPrincipalId = isUserInvoiceContext(context) ? null : context.principal.id;
    return withTenantTransaction(context.tenantId, async (client) => {
      const lock = await client.query<{ status: string; tax_snapshot_id: string | null }>(
        `SELECT status, tax_snapshot_id FROM public.finance_invoices
          WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
        [context.tenantId, invoiceId],
      );
      const sourceRow = lock.rows[0];
      if (!sourceRow || sourceRow.status !== "ISSUED") {
        throw new CreditNoteServiceError("SOURCE_INVOICE_NOT_ISSUED", "Only an issued invoice can be fully reversed by a credit note.");
      }
      if (!sourceRow.tax_snapshot_id) {
        throw new CreditNoteServiceError("SOURCE_TAX_SNAPSHOT_MISSING", "The source invoice has no tax evidence.");
      }
      const existing = await client.query<{ id: string }>(
        "SELECT id FROM public.finance_credit_notes WHERE tenant_id = $1 AND original_invoice_id = $2",
        [context.tenantId, invoiceId],
      );
      if (existing.rows[0]) {
        throw new CreditNoteServiceError("CREDIT_NOTE_ALREADY_EXISTS", "A full-reversal credit note already exists for this invoice.");
      }
      const source = await invoiceRepository.findById(client, context.tenantId, invoiceId);
      if (!source || source.status !== "ISSUED" || !source.invoiceCode || !source.taxSnapshotId || source.taxStatus !== "CALCULATED") {
        throw new CreditNoteServiceError("SOURCE_INVOICE_NOT_ISSUED", "The issued source invoice could not be validated.");
      }
      const tax = await client.query<{
        applied_rules_snapshot: Record<string, unknown>[];
        result_snapshot: Record<string, unknown>;
      }>(
        `SELECT applied_rules_snapshot, result_snapshot
           FROM public.finance_tax_calculation_snapshots
          WHERE tenant_id = $1 AND id = $2 AND document_type = 'INVOICE'
            AND document_id = $3 AND document_version = $4`,
        [context.tenantId, source.taxSnapshotId, source.id, source.documentVersion],
      );
      const snapshot = tax.rows[0];
      if (!snapshot) throw new CreditNoteServiceError("SOURCE_TAX_SNAPSHOT_MISSING", "The source tax snapshot could not be loaded.");

      const sequenceResult = await client.query<{ fiscal_year: number; allocated_number: string }>(
        `WITH issue_clock AS (SELECT (timezone('UTC', clock_timestamp()))::date AS issue_date)
         SELECT EXTRACT(YEAR FROM issue_clock.issue_date)::integer AS fiscal_year,
                public.finance_allocate_invoice_number(
                  $1::uuid, EXTRACT(YEAR FROM issue_clock.issue_date)::integer
                )::text AS allocated_number
           FROM issue_clock`,
        [context.tenantId],
      );
      const sequence = sequenceResult.rows[0];
      if (!sequence) throw new Error("CREDIT_NOTE_SEQUENCE_ALLOCATION_FAILED");
      const code = `CN-${sequence.fiscal_year}-${sequence.allocated_number.padStart(6, "0")}`;
      const creditNoteId = randomUUID();
      const documentInvoice = {
        ...source,
        id: creditNoteId,
        invoiceCode: code,
        status: "ISSUED" as const,
        issueDate: new Date().toISOString().slice(0, 10),
        notes: `AVOIR intégral de ${source.invoiceCode}. Motif : ${reason}`,
      };
      const htmlContent = renderInvoiceHtmlDocument({
        invoice: documentInvoice,
        appliedRules: snapshot.applied_rules_snapshot,
        taxResult: snapshot.result_snapshot,
        documentLabel: "AVOIR",
      });
      const pdfContent = renderInvoicePdfDocument(documentInvoice, "AVOIR");
      const htmlSha256 = createHash("sha256").update(htmlContent, "utf8").digest("hex");
      const pdfSha256 = createHash("sha256").update(pdfContent).digest("hex");
      const inserted = await client.query<{
        id: string; original_invoice_id: string; credit_note_code: string; status: "ISSUED";
        reason: string; currency_code: string; grand_total: string; amount_due: string;
        html_sha256: string; pdf_sha256: string; issued_at: string;
      }>(
        `INSERT INTO public.finance_credit_notes (
          id, tenant_id, original_invoice_id, credit_note_code, status, reason, currency_code,
          currency_minor_unit, customer_snapshot, source_tax_snapshot_id, source_tax_snapshot_version,
          document_version, lines_snapshot, subtotal, discount_total, taxable_total, tax_total,
          grand_total, amount_due, html_content, html_sha256, pdf_content, pdf_sha256, issued_by_principal_id,
          issued_by_actor_type, issued_by_actor_ref
        ) VALUES (
          $1,$2,$3,$4,'ISSUED',$5,$6,$7,$8::jsonb,$9,$10,1,$11::jsonb,
          $12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24
        )
        RETURNING id, original_invoice_id, credit_note_code, status, reason, currency_code,
          grand_total::text, amount_due::text, html_sha256, pdf_sha256,
          to_char(issued_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS issued_at`,
        [
          creditNoteId, context.tenantId, source.id, code, reason, source.currencyCode, source.currencyMinorUnit,
          JSON.stringify(source.customerSnapshot), source.taxSnapshotId, source.taxSnapshotVersion,
          JSON.stringify(source.lines), source.subtotal, source.discountTotal, source.taxableTotal, source.taxTotal,
          source.grandTotal, source.amountDue, htmlContent, htmlSha256, pdfContent, pdfSha256, legacyPrincipalId, actor.type, actor.ref,
        ],
      );
      const row = inserted.rows[0];
      if (!row) throw new Error("CREDIT_NOTE_INSERT_FAILED");
      await recordInvoiceAudit(client, context, "invoice.credit_note.issued", "CREDIT_NOTE", row.id, {
        creditNoteCode: row.credit_note_code,
        originalInvoiceId: row.original_invoice_id,
        fullReversal: true,
        currencyCode: row.currency_code.trim(),
      });
      return {
        id: row.id, originalInvoiceId: row.original_invoice_id, creditNoteCode: row.credit_note_code,
        status: row.status, reason: row.reason, currencyCode: row.currency_code.trim(),
        grandTotal: row.grand_total, amountDue: row.amount_due, htmlSha256: row.html_sha256,
        pdfSha256: row.pdf_sha256, issuedAt: row.issued_at,
      };
    });
  },
};
