import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import type { FinanceInvoice } from "./invoice.repository.js";
import { renderInvoiceHtmlDocument } from "../documents/invoice-html-renderer.js";

export interface InvoiceDocumentArtifact {
  id: string;
  invoiceId: string;
  invoiceCode: string;
  documentVersion: number;
  contentType: string;
  contentSha256: string;
  htmlContent: string;
  createdAt: string;
}

interface ArtifactRow {
  id: string;
  invoice_id: string;
  invoice_code: string;
  document_version: number;
  content_type: string;
  content_sha256: string;
  html_content: string;
  created_at: string;
}

const artifactColumns = `id, invoice_id, invoice_code, document_version, content_type, content_sha256,
  html_content, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at`;

export const invoiceDocumentRepository = {
  async createForIssuedInvoice(
    client: PoolClient,
    tenantId: string,
    principalId: string,
    invoice: FinanceInvoice,
  ): Promise<InvoiceDocumentArtifact> {
    if (invoice.status !== "ISSUED" || !invoice.invoiceCode || !invoice.taxSnapshotId) {
      throw new Error("INVOICE_DOCUMENT_REQUIRES_ISSUED_TAX_SNAPSHOTTED_INVOICE");
    }
    const tax = await client.query<{
      applied_rules_snapshot: Record<string, unknown>[];
      result_snapshot: Record<string, unknown>;
    }>(
      `SELECT applied_rules_snapshot, result_snapshot
         FROM public.finance_tax_calculation_snapshots
        WHERE tenant_id = $1 AND id = $2 AND document_type = 'INVOICE'
          AND document_id = $3 AND document_version = $4`,
      [tenantId, invoice.taxSnapshotId, invoice.id, invoice.documentVersion],
    );
    const snapshot = tax.rows[0];
    if (!snapshot) throw new Error("INVOICE_TAX_SNAPSHOT_NOT_FOUND_FOR_DOCUMENT");
    const htmlContent = renderInvoiceHtmlDocument({
      invoice,
      appliedRules: snapshot.applied_rules_snapshot,
      taxResult: snapshot.result_snapshot,
    });
    const contentSha256 = createHash("sha256").update(htmlContent, "utf8").digest("hex");
    const created = await client.query<ArtifactRow>(
      `INSERT INTO public.finance_invoice_document_artifacts
        (tenant_id, invoice_id, document_version, document_type, invoice_code, content_type,
         html_content, content_sha256, created_by_principal_id)
       VALUES ($1,$2,$3,'INVOICE',$4,'text/html; charset=utf-8',$5,$6,$7)
       RETURNING ${artifactColumns}`,
      [tenantId, invoice.id, invoice.documentVersion, invoice.invoiceCode, htmlContent, contentSha256, principalId],
    );
    const row = created.rows[0];
    if (!row) throw new Error("INVOICE_DOCUMENT_ARTIFACT_INSERT_FAILED");
    return {
      id: row.id,
      invoiceId: row.invoice_id,
      invoiceCode: row.invoice_code,
      documentVersion: row.document_version,
      contentType: row.content_type,
      contentSha256: row.content_sha256,
      htmlContent: row.html_content,
      createdAt: row.created_at,
    };
  },

  async findForInvoice(
    client: PoolClient,
    tenantId: string,
    invoiceId: string,
  ): Promise<InvoiceDocumentArtifact | null> {
    const result = await client.query<ArtifactRow>(
      `SELECT ${artifactColumns}
         FROM public.finance_invoice_document_artifacts
        WHERE tenant_id = $1 AND invoice_id = $2 AND document_type = 'INVOICE'
        ORDER BY document_version DESC
        LIMIT 1`,
      [tenantId, invoiceId],
    );
    const row = result.rows[0];
    if (!row) return null;
    const actualHash = createHash("sha256").update(row.html_content, "utf8").digest("hex");
    if (actualHash !== row.content_sha256) {
      throw new Error("INVOICE_DOCUMENT_ARTIFACT_HASH_MISMATCH");
    }
    return {
      id: row.id,
      invoiceId: row.invoice_id,
      invoiceCode: row.invoice_code,
      documentVersion: row.document_version,
      contentType: row.content_type,
      contentSha256: row.content_sha256,
      htmlContent: row.html_content,
      createdAt: row.created_at,
    };
  },
};
