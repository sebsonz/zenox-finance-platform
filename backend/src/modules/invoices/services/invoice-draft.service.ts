import { withTenantTransaction } from "../../../db/transaction.js";
import { currencyRepository } from "../../currencies/repositories/currency.repository.js";
import type { FinanceInvoiceOperationContext } from "../types/invoice-operation-context.js";
import { recordInvoiceAudit } from "../repositories/invoice-audit.repository.js";
import { customerRepository } from "../../customers/repositories/customer.repository.js";
import { calculateInvoiceTotals } from "../engine/invoice-calculation.engine.js";
import { invoiceRepository, type FinanceInvoice } from "../repositories/invoice.repository.js";
import type { CreateInvoiceDraftInput, ListInvoiceDraftsQuery, UpdateInvoiceDraftInput } from "../validators/invoice-draft.schema.js";

export class InvoiceDraftServiceError extends Error {
  constructor(readonly code: "CUSTOMER_NOT_FOUND" | "CUSTOMER_NOT_ACTIVE" | "CURRENCY_NOT_SUPPORTED" | "DRAFT_NOT_FOUND_OR_CHANGED", message: string) {
    super(message);
    this.name = "InvoiceDraftServiceError";
  }
}

export const invoiceDraftService = {
  async create(context: FinanceInvoiceOperationContext, input: CreateInvoiceDraftInput): Promise<FinanceInvoice> {
    const currency = await currencyRepository.findActiveByCode(input.currencyCode);
    if (!currency) throw new InvoiceDraftServiceError("CURRENCY_NOT_SUPPORTED", "The requested currency is not active.");

    return withTenantTransaction(context.tenantId, async (client) => {
      const customer = await customerRepository.findById(client, input.customerId);
      if (!customer) throw new InvoiceDraftServiceError("CUSTOMER_NOT_FOUND", "The customer was not found in this tenant.");
      if (customer.status !== "ACTIVE") throw new InvoiceDraftServiceError("CUSTOMER_NOT_ACTIVE", "Archived customers cannot be used for new invoices.");

      const totals = calculateInvoiceTotals({
        currency: currency.code,
        currencyDecimalPlaces: currency.minorUnit,
        lines: input.lines.map((line) => ({
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          discountPercent: line.discountPercent,
          taxRatePercent: line.taxRatePercent,
        })),
      });
      const invoice = await invoiceRepository.createDraft(
        client, context, input, currency.minorUnit, totals, totals.lines, customer,
      );
      await recordInvoiceAudit(client, context, "invoice.draft.created", "INVOICE", invoice.id, {
        status: invoice.status,
        currencyCode: invoice.currencyCode,
        lineCount: invoice.lines.length,
        documentVersion: invoice.documentVersion,
      });
      return invoice;
    });
  },

  async updateDraft(context: FinanceInvoiceOperationContext, invoiceId: string, input: UpdateInvoiceDraftInput): Promise<FinanceInvoice> {
    const currency = await currencyRepository.findActiveByCode(input.currencyCode);
    if (!currency) throw new InvoiceDraftServiceError("CURRENCY_NOT_SUPPORTED", "The requested currency is not active.");

    return withTenantTransaction(context.tenantId, async (client) => {
      const customer = await customerRepository.findById(client, input.customerId);
      if (!customer) throw new InvoiceDraftServiceError("CUSTOMER_NOT_FOUND", "The customer was not found in this tenant.");
      if (customer.status !== "ACTIVE") throw new InvoiceDraftServiceError("CUSTOMER_NOT_ACTIVE", "Archived customers cannot be used for new invoices.");

      const totals = calculateInvoiceTotals({
        currency: currency.code,
        currencyDecimalPlaces: currency.minorUnit,
        lines: input.lines.map((line) => ({
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          discountPercent: line.discountPercent,
          taxRatePercent: line.taxRatePercent,
        })),
      });

      const invoice = await invoiceRepository.updateDraft(
        client, context, invoiceId, input.expectedUpdatedAt, input, currency.minorUnit,
        totals, totals.lines, customer,
      );
      if (!invoice) {
        throw new InvoiceDraftServiceError(
          "DRAFT_NOT_FOUND_OR_CHANGED",
          "The draft is unavailable, no longer editable, or was changed by another request. Reload it before editing again.",
        );
      }
      await recordInvoiceAudit(client, context, "invoice.draft.updated", "INVOICE", invoice.id, {
        status: invoice.status,
        currencyCode: invoice.currencyCode,
        lineCount: invoice.lines.length,
        documentVersion: invoice.documentVersion,
      });
      return invoice;
    });
  },

  async findById(context: FinanceInvoiceOperationContext, invoiceId: string): Promise<FinanceInvoice | null> {
    return withTenantTransaction(context.tenantId, (client) => invoiceRepository.findById(client, context.tenantId, invoiceId));
  },

  async list(context: FinanceInvoiceOperationContext, query: ListInvoiceDraftsQuery): Promise<FinanceInvoice[]> {
    return withTenantTransaction(context.tenantId, (client) => invoiceRepository.list(client, context.tenantId, query));
  },
};
