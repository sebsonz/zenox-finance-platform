import { Decimal } from "decimal.js";
import { withTenantTransaction } from "../../../db/transaction.js";
import { currencyRepository } from "../../currencies/repositories/currency.repository.js";
import type { FinanceInvoiceOperationContext } from "../types/invoice-operation-context.js";
import { recordInvoiceAudit } from "../repositories/invoice-audit.repository.js";
import { customerRepository } from "../../customers/repositories/customer.repository.js";
import { calculateInvoiceTotals } from "../engine/invoice-calculation.engine.js";
import { invoiceRepository, type FinanceInvoice } from "../repositories/invoice.repository.js";
import type { CreateInvoiceDraftInput, ListInvoiceDraftsQuery, UpdateInvoiceDraftInput } from "../validators/invoice-draft.schema.js";

export class InvoiceDraftServiceError extends Error {
  constructor(readonly code: "CUSTOMER_NOT_FOUND" | "CUSTOMER_NOT_ACTIVE" | "CURRENCY_NOT_SUPPORTED" | "DRAFT_NOT_FOUND_OR_CHANGED" | "INVALID_DOCUMENT_TYPE_AMOUNT" | "DEPOSIT_SOURCE_NOT_AVAILABLE" | "DEPOSIT_SOURCE_MISMATCH" | "BALANCE_AMOUNT_MISMATCH", message: string) {
    super(message);
    this.name = "InvoiceDraftServiceError";
  }
}

async function validateDocumentType(
  client: import("pg").PoolClient,
  context: FinanceInvoiceOperationContext,
  input: CreateInvoiceDraftInput,
  customerId: string,
  currencyCode: string,
  grandTotal: string,
): Promise<void> {
  if (input.documentType === "STANDARD") return;
  if (input.documentType === "DEPOSIT") {
    const contractTotal = new Decimal(input.contractTotal ?? "0");
    if (!contractTotal.isFinite() || !contractTotal.gt(grandTotal)) {
      throw new InvoiceDraftServiceError("INVALID_DOCUMENT_TYPE_AMOUNT", "The contract total must be greater than the deposit invoice amount.");
    }
    return;
  }

  const source = await invoiceRepository.findById(client, context.tenantId, input.relatedInvoiceId ?? "");
  if (!source || source.status !== "ISSUED" || source.documentType !== "DEPOSIT" || !source.contractTotal) {
    throw new InvoiceDraftServiceError("DEPOSIT_SOURCE_NOT_AVAILABLE", "A balance invoice must reference an issued deposit invoice in the same organisation.");
  }
  if (source.customerId !== customerId || source.currencyCode !== currencyCode) {
    throw new InvoiceDraftServiceError("DEPOSIT_SOURCE_MISMATCH", "The balance invoice must use the same customer and currency as its deposit invoice.");
  }
  const remaining = new Decimal(source.contractTotal).minus(source.grandTotal);
  if (!remaining.gt(0) || !remaining.equals(grandTotal)) {
    throw new InvoiceDraftServiceError("BALANCE_AMOUNT_MISMATCH", "The balance invoice total must equal the contract total minus the already invoiced deposit.");
  }
}

async function loadIssuerSnapshot(client: import("pg").PoolClient, tenantId: string): Promise<Record<string, unknown>> {
  const result = await client.query<{
    legal_name: string; country_code: string; trade_name: string | null; website_url: string | null;
    general_email: string | null; general_phone: string | null; address_line1: string | null;
    address_line2: string | null; city: string | null; region: string | null;
    postal_code: string | null; address_country_code: string | null;
  }>(
    `SELECT t.legal_name, t.country_code, p.trade_name, p.website_url, p.general_email, p.general_phone,
            a.address_line1, a.address_line2, a.city, a.region, a.postal_code,
            a.country_code AS address_country_code
       FROM public.finance_tenants t
       LEFT JOIN public.finance_tenant_profiles p ON p.tenant_id = t.id
       LEFT JOIN LATERAL (
         SELECT address_line1, address_line2, city, region, postal_code, country_code
           FROM public.finance_tenant_addresses
          WHERE tenant_id = t.id AND status = 'ACTIVE'
            AND valid_from <= CURRENT_DATE AND (valid_to IS NULL OR valid_to >= CURRENT_DATE)
          ORDER BY is_primary DESC,
                   CASE address_type WHEN 'BILLING' THEN 0 WHEN 'REGISTERED' THEN 1 WHEN 'BUSINESS' THEN 2 ELSE 3 END,
                   valid_from DESC, id
          LIMIT 1
       ) a ON true
      WHERE t.id = $1 LIMIT 1`,
    [tenantId],
  );
  const issuer = result.rows[0];
  if (!issuer) throw new Error("INVOICE_ISSUER_TENANT_NOT_FOUND");
  return {
    legalName: issuer.legal_name, tradeName: issuer.trade_name,
    countryCode: issuer.address_country_code ?? issuer.country_code,
    address: issuer.address_line1, addressLine2: issuer.address_line2,
    city: issuer.city, region: issuer.region, postalCode: issuer.postal_code,
    email: issuer.general_email, phone: issuer.general_phone, websiteUrl: issuer.website_url,
  };
}

export const invoiceDraftService = {
  async create(context: FinanceInvoiceOperationContext, input: CreateInvoiceDraftInput): Promise<FinanceInvoice> {
    const currency = await currencyRepository.findActiveByCode(input.currencyCode);
    if (!currency) throw new InvoiceDraftServiceError("CURRENCY_NOT_SUPPORTED", "The requested currency is not active.");

    return withTenantTransaction(context.tenantId, async (client) => {
      const customer = await customerRepository.findById(client, input.customerId);
      if (!customer) throw new InvoiceDraftServiceError("CUSTOMER_NOT_FOUND", "The customer was not found in this tenant.");
      if (customer.status !== "ACTIVE") throw new InvoiceDraftServiceError("CUSTOMER_NOT_ACTIVE", "Archived customers cannot be used for new invoices.");

      const issuerSnapshot = await loadIssuerSnapshot(client, context.tenantId);
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
      await validateDocumentType(client, context, input, customer.id, currency.code, totals.grandTotal);
      const invoice = await invoiceRepository.createDraft(
        client, context, input, currency.minorUnit, totals, totals.lines, customer, issuerSnapshot,
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

      const issuerSnapshot = await loadIssuerSnapshot(client, context.tenantId);
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

      await validateDocumentType(client, context, input, customer.id, currency.code, totals.grandTotal);
      const invoice = await invoiceRepository.updateDraft(
        client, context, invoiceId, input.expectedUpdatedAt, input, currency.minorUnit,
        totals, totals.lines, customer, issuerSnapshot,
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
