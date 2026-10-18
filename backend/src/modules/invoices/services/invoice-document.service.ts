import { withTenantTransaction } from "../../../db/transaction.js";
import type { FinanceInvoiceOperationContext } from "../types/invoice-operation-context.js";
import { invoiceDocumentRepository, type InvoiceDocumentArtifact } from "../repositories/invoice-document.repository.js";
import { invoicePdfRepository, type InvoicePdfArtifact } from "../repositories/invoice-pdf.repository.js";

export const invoiceDocumentService = {
  async findForInvoice(context: FinanceInvoiceOperationContext, invoiceId: string): Promise<InvoiceDocumentArtifact | null> {
    return withTenantTransaction(context.tenantId,
      (client) => invoiceDocumentRepository.findForInvoice(client, context.tenantId, invoiceId));
  },
  async findPdfForInvoice(context: FinanceRequestContext, invoiceId: string): Promise<InvoicePdfArtifact | null> {
    return withTenantTransaction(context.tenantId,
      (client) => invoicePdfRepository.findForInvoice(client, context.tenantId, invoiceId));
  },
};
