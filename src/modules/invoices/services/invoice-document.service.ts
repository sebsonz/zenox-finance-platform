import { withTenantTransaction } from "../../../db/transaction.js";
import type { FinanceRequestContext } from "../../integration-auth/types/authenticated-principal.js";
import { invoiceDocumentRepository, type InvoiceDocumentArtifact } from "../repositories/invoice-document.repository.js";

export const invoiceDocumentService = {
  async findForInvoice(
    context: FinanceRequestContext,
    invoiceId: string,
  ): Promise<InvoiceDocumentArtifact | null> {
    return withTenantTransaction(
      context.tenantId,
      (client) => invoiceDocumentRepository.findForInvoice(client, context.tenantId, invoiceId),
    );
  },
};
