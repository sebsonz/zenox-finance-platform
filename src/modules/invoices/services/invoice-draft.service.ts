import { withTenantTransaction } from "../../../db/transaction.js";
import { currencyRepository } from "../../currencies/repositories/currency.repository.js";
import type { FinanceRequestContext } from "../../integration-auth/types/authenticated-principal.js";
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
  async create(context: FinanceRequestContext, input: CreateInvoiceDraftInput): Promise<FinanceInvoice> {
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
      return invoiceRepository.createDraft(
        client, context.tenantId, context.principal.id, input, currency.minorUnit, totals, totals.lines, customer,
      );
    });
  },

  async updateDraft(context: FinanceRequestContext, invoiceId: string, input: UpdateInvoiceDraftInput): Promise<FinanceInvoice> {
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
        client, context.tenantId, invoiceId, input.expectedUpdatedAt, input, currency.minorUnit,
        totals, totals.lines, customer,
      );
      if (!invoice) {
        throw new InvoiceDraftServiceError(
          "DRAFT_NOT_FOUND_OR_CHANGED",
          "The draft is unavailable, no longer editable, or was changed by another request. Reload it before editing again.",
        );
      }
      return invoice;
    });
  },

  async findById(context: FinanceRequestContext, invoiceId: string): Promise<FinanceInvoice | null> {
    return withTenantTransaction(context.tenantId, (client) => invoiceRepository.findById(client, context.tenantId, invoiceId));
  },

  async list(context: FinanceRequestContext, query: ListInvoiceDraftsQuery): Promise<FinanceInvoice[]> {
    return withTenantTransaction(context.tenantId, (client) => invoiceRepository.list(client, context.tenantId, query));
  },
};
