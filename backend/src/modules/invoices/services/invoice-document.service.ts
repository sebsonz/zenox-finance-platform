import { withTenantTransaction } from "../../../db/transaction.js";
import type { FinanceInvoiceOperationContext } from "../types/invoice-operation-context.js";
import { isUserInvoiceContext } from "../types/invoice-operation-context.js";
import { recordInvoiceAudit } from "../repositories/invoice-audit.repository.js";
import { invoiceDocumentRepository, type InvoiceDocumentArtifact } from "../repositories/invoice-document.repository.js";
import { invoicePdfRepository, type InvoicePdfArtifact } from "../repositories/invoice-pdf.repository.js";

export const invoiceDocumentService = {
  async findForInvoice(context: FinanceInvoiceOperationContext, invoiceId: string): Promise<InvoiceDocumentArtifact | null> {
    return withTenantTransaction(context.tenantId, async (client) => {
      const artifact = await invoiceDocumentRepository.findForInvoice(client, context.tenantId, invoiceId);
      if (artifact && isUserInvoiceContext(context)) {
        await recordInvoiceAudit(client, context, "invoice.document.read", "INVOICE", invoiceId, {
          format: "HTML", documentVersion: artifact.documentVersion, sha256: artifact.contentSha256,
        });
      }
      return artifact;
    });
  },
  async findPdfForInvoice(context: FinanceInvoiceOperationContext, invoiceId: string): Promise<InvoicePdfArtifact | null> {
    return withTenantTransaction(context.tenantId, async (client) => {
      const artifact = await invoicePdfRepository.findForInvoice(client, context.tenantId, invoiceId);
      if (artifact && isUserInvoiceContext(context)) {
        await recordInvoiceAudit(client, context, "invoice.document.read", "INVOICE", invoiceId, {
          format: "PDF", documentVersion: artifact.documentVersion, sha256: artifact.contentSha256,
        });
      }
      return artifact;
    });
  },
};
