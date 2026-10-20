import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import type { FinanceInvoice } from "./invoice.repository.js";
import type { FinanceInvoiceOperationContext } from "../types/invoice-operation-context.js";
import { invoiceActor, isUserInvoiceContext } from "../types/invoice-operation-context.js";
import { renderInvoicePdfDocument } from "../documents/invoice-pdf-renderer.js";

export interface InvoicePdfArtifact {
  id: string;
  invoiceId: string;
  invoiceCode: string;
  documentVersion: number;
  contentType: "application/pdf";
  contentSha256: string;
  pdfContent: Buffer;
  createdAt: string;
}
interface PdfRow {
  id: string; invoice_id: string; invoice_code: string; document_version: number;
  content_type: "application/pdf"; content_sha256: string; pdf_content: Buffer; created_at: string;
}
const columns = `id, invoice_id, invoice_code, document_version, content_type, content_sha256, pdf_content,
  to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at`;

function toArtifact(row: PdfRow): InvoicePdfArtifact {
  const actualHash = createHash("sha256").update(row.pdf_content).digest("hex");
  if (actualHash !== row.content_sha256) throw new Error("INVOICE_PDF_ARTIFACT_HASH_MISMATCH");
  return {
    id: row.id, invoiceId: row.invoice_id, invoiceCode: row.invoice_code,
    documentVersion: row.document_version, contentType: row.content_type,
    contentSha256: row.content_sha256, pdfContent: row.pdf_content, createdAt: row.created_at,
  };
}

export const invoicePdfRepository = {
  async createForIssuedInvoice(
    client: PoolClient, context: FinanceInvoiceOperationContext, invoice: FinanceInvoice,
  ): Promise<InvoicePdfArtifact> {
    if (invoice.status !== "ISSUED" || !invoice.invoiceCode || !invoice.taxSnapshotId) {
      throw new Error("INVOICE_PDF_REQUIRES_ISSUED_TAX_SNAPSHOTTED_INVOICE");
    }
    const actor = invoiceActor(context);
    const legacyPrincipalId = isUserInvoiceContext(context) ? null : context.principal.id;
    const pdfContent = renderInvoicePdfDocument(invoice);
    const contentSha256 = createHash("sha256").update(pdfContent).digest("hex");
    const result = await client.query<PdfRow>(
      `INSERT INTO public.finance_invoice_pdf_artifacts
        (tenant_id, invoice_id, document_version, invoice_code, pdf_content, content_sha256, created_by_principal_id, created_by_actor_type, created_by_actor_ref)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING ${columns}`,
      [context.tenantId, invoice.id, invoice.documentVersion, invoice.invoiceCode, pdfContent, contentSha256, legacyPrincipalId, actor.type, actor.ref],
    );
    const row = result.rows[0];
    if (!row) throw new Error("INVOICE_PDF_ARTIFACT_INSERT_FAILED");
    return toArtifact(row);
  },

  async findForInvoice(client: PoolClient, tenantId: string, invoiceId: string): Promise<InvoicePdfArtifact | null> {
    const result = await client.query<PdfRow>(
      `SELECT ${columns} FROM public.finance_invoice_pdf_artifacts
        WHERE tenant_id = $1 AND invoice_id = $2 ORDER BY document_version DESC LIMIT 1`,
      [tenantId, invoiceId],
    );
    return result.rows[0] ? toArtifact(result.rows[0]) : null;
  },
};
