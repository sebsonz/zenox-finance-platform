import { withTenantTransaction } from "../../../db/transaction.js";
import type { FinanceRequestContext } from "../../integration-auth/types/authenticated-principal.js";
import { invoiceRepository, type FinanceInvoice } from "../repositories/invoice.repository.js";

export class InvoiceIssuanceServiceError extends Error {
  constructor(
    readonly code: "INVOICE_NOT_FOUND_OR_CHANGED" | "INVOICE_TAX_NOT_CALCULATED" | "INVOICE_REQUIRES_LINES",
    message: string,
  ) {
    super(message);
    this.name = "InvoiceIssuanceServiceError";
  }
}

export const invoiceIssuanceService = {
  async issue(
    context: FinanceRequestContext,
    invoiceId: string,
    expectedUpdatedAt: string,
  ): Promise<FinanceInvoice> {
    return withTenantTransaction(context.tenantId, async (client) => {
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
                updated_at = clock_timestamp()
          WHERE tenant_id = $1 AND id = $2 AND status = 'DRAFT'
            AND updated_at = $3::timestamptz
          RETURNING id`,
        [context.tenantId, invoiceId, expectedUpdatedAt, invoiceCode, context.principal.id],
      );
      if (updated.rowCount !== 1) {
        throw new InvoiceIssuanceServiceError(
          "INVOICE_NOT_FOUND_OR_CHANGED",
          "The draft changed while it was being issued. No invoice number was consumed.",
        );
      }
      const issued = await invoiceRepository.findById(client, context.tenantId, invoiceId);
      if (!issued) throw new Error("ISSUED_INVOICE_READBACK_FAILED");
      return issued;
    });
  },
};
