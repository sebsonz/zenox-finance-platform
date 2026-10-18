import { withTenantTransaction } from "../../../db/transaction.js";
import type { FinanceInvoiceOperationContext } from "../types/invoice-operation-context.js";
import { invoiceActor, isUserInvoiceContext } from "../types/invoice-operation-context.js";
import { recordInvoiceAudit } from "../repositories/invoice-audit.repository.js";
import { invoiceRepository, type FinanceInvoice } from "../repositories/invoice.repository.js";
import { invoiceDocumentRepository } from "../repositories/invoice-document.repository.js";
import { invoicePdfRepository } from "../repositories/invoice-pdf.repository.js";

export class InvoiceIssuanceServiceError extends Error {
  constructor(
    readonly code: "INVOICE_NOT_FOUND_OR_CHANGED" | "INVOICE_TAX_NOT_CALCULATED" | "INVOICE_REQUIRES_LINES" | "IDEMPOTENCY_KEY_REUSED",
    message: string,
  ) {
    super(message);
    this.name = "InvoiceIssuanceServiceError";
  }
}

export const invoiceIssuanceService = {
  async issue(
    context: FinanceInvoiceOperationContext,
    invoiceId: string,
    expectedUpdatedAt: string,
    idempotencyKey: string,
  ): Promise<FinanceInvoice> {
    const actor = invoiceActor(context);
    const legacyPrincipalId = isUserInvoiceContext(context) ? null : context.principal.id;
    return withTenantTransaction(context.tenantId, async (client) => {
      await client.query(
        `INSERT INTO public.finance_invoice_issuance_requests
          (tenant_id, idempotency_key, invoice_id, expected_updated_at)
         VALUES ($1,$2,$3,$4::timestamptz)
         ON CONFLICT (tenant_id, idempotency_key) DO NOTHING`,
        [context.tenantId, idempotencyKey, invoiceId, expectedUpdatedAt],
      );
      const requestResult = await client.query<{
        invoice_id: string;
        issued_invoice_code: string | null;
        completed_at: string | null;
        expected_revision_matches: boolean;
      }>(
        `SELECT invoice_id, issued_invoice_code, completed_at,
                expected_updated_at = $3::timestamptz AS expected_revision_matches
           FROM public.finance_invoice_issuance_requests
          WHERE tenant_id = $1 AND idempotency_key = $2
          FOR UPDATE`,
        [context.tenantId, idempotencyKey, expectedUpdatedAt],
      );
      const issuanceRequest = requestResult.rows[0];
      if (!issuanceRequest || issuanceRequest.invoice_id !== invoiceId || !issuanceRequest.expected_revision_matches) {
        throw new InvoiceIssuanceServiceError(
          "IDEMPOTENCY_KEY_REUSED",
          "This idempotency key has already been used for another invoice or revision.",
        );
      }
      if (issuanceRequest.completed_at && issuanceRequest.issued_invoice_code) {
        const alreadyIssued = await invoiceRepository.findById(client, context.tenantId, invoiceId);
        if (alreadyIssued?.status === "ISSUED" && alreadyIssued.invoiceCode === issuanceRequest.issued_invoice_code) {
          return alreadyIssued;
        }
        throw new InvoiceIssuanceServiceError(
          "IDEMPOTENCY_KEY_REUSED",
          "The idempotency record does not match the current issued invoice.",
        );
      }

      const locked = await client.query<{
        id: string;
        status: string;
        tax_status: string;
        tax_snapshot_id: string | null;
        updated_at: string;
      }>(
        `SELECT id, status, tax_status, tax_snapshot_id,
                to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at
           FROM public.finance_invoices
          WHERE tenant_id = $1 AND id = $2 AND status = 'DRAFT'
            AND updated_at = $3::timestamptz
          FOR UPDATE`,
        [context.tenantId, invoiceId, expectedUpdatedAt],
      );
      const invoice = locked.rows[0];
      if (!invoice) {
        throw new InvoiceIssuanceServiceError(
          "INVOICE_NOT_FOUND_OR_CHANGED",
          "The draft is unavailable or has changed. Reload it before issuing.",
        );
      }
      if (invoice.tax_status !== "CALCULATED" || !invoice.tax_snapshot_id) {
        throw new InvoiceIssuanceServiceError(
          "INVOICE_TAX_NOT_CALCULATED",
          "A valid immutable tax snapshot must be attached before issuance.",
        );
      }

      const lines = await client.query<{ id: string }>(
        `SELECT id FROM public.finance_invoice_lines
          WHERE tenant_id = $1 AND invoice_id = $2
          ORDER BY line_number LIMIT 1`,
        [context.tenantId, invoiceId],
      );
      if (lines.rowCount !== 1) {
        throw new InvoiceIssuanceServiceError(
          "INVOICE_REQUIRES_LINES",
          "At least one invoice line is required before issuance.",
        );
      }

      const allocation = await client.query<{ fiscal_year: number; allocated_number: string }>(
        `WITH issue_clock AS (
           SELECT (timezone('UTC', clock_timestamp()))::date AS issue_date
         )
         SELECT EXTRACT(YEAR FROM issue_clock.issue_date)::integer AS fiscal_year,
                public.finance_allocate_invoice_number(
                  $1::uuid,
                  EXTRACT(YEAR FROM issue_clock.issue_date)::integer
                )::text AS allocated_number
           FROM issue_clock`,
        [context.tenantId],
      );
      const sequence = allocation.rows[0];
      if (!sequence) throw new Error("INVOICE_SEQUENCE_ALLOCATION_FAILED");
      const invoiceCode = `INV-${sequence.fiscal_year}-${sequence.allocated_number.padStart(6, "0")}`;
      const updated = await client.query(
        `UPDATE public.finance_invoices
            SET status = 'ISSUED',
                invoice_code = $4,
                issue_date = (timezone('UTC', clock_timestamp()))::date,
                issued_at = clock_timestamp(),
                issued_by_principal_id = $5,
                issued_by_actor_type = $6,
                issued_by_actor_ref = $7,
                updated_by_actor_type = $6,
                updated_by_actor_ref = $7,
                updated_at = clock_timestamp()
          WHERE tenant_id = $1 AND id = $2 AND status = 'DRAFT'
            AND updated_at = $3::timestamptz
          RETURNING id`,
        [context.tenantId, invoiceId, expectedUpdatedAt, invoiceCode, legacyPrincipalId, actor.type, actor.ref],
      );
      if (updated.rowCount !== 1) {
        throw new InvoiceIssuanceServiceError(
          "INVOICE_NOT_FOUND_OR_CHANGED",
          "The draft changed while it was being issued. No invoice number was consumed.",
        );
      }
      const issued = await invoiceRepository.findById(client, context.tenantId, invoiceId);
      if (!issued) throw new Error("ISSUED_INVOICE_READBACK_FAILED");
      // The immutable document artifact is written in the same transaction as
      // the issue transition; a rendering/storage failure rolls issuance back.
      await invoiceDocumentRepository.createForIssuedInvoice(
        client,
        context.tenantId,
        context,
        issued,
      );
      await invoicePdfRepository.createForIssuedInvoice(
        client,
        context.tenantId,
        context,
        issued,
      );
      await recordInvoiceAudit(client, context, "invoice.issued", "INVOICE", issued.id, {
        invoiceCode: issued.invoiceCode,
        documentVersion: issued.documentVersion,
        taxSnapshotId: issued.taxSnapshotId,
        htmlArtifactCreated: true,
        pdfArtifactCreated: true,
      });
      await client.query(
        `UPDATE public.finance_invoice_issuance_requests
            SET issued_invoice_code = $3, completed_at = clock_timestamp()
          WHERE tenant_id = $1 AND idempotency_key = $2`,
        [context.tenantId, idempotencyKey, issued.invoiceCode],
      );
      return issued;
    });
  },
};
