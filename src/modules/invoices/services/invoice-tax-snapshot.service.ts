import { Decimal } from "decimal.js";
import { withTenantTransaction } from "../../../db/transaction.js";
import type { FinanceRequestContext } from "../../integration-auth/types/authenticated-principal.js";
import { currencyRepository } from "../../currencies/repositories/currency.repository.js";
import { taxRuleRepository } from "../../tax/repositories/tax-rule.repository.js";
import { taxSnapshotRepository, type TaxCalculationSnapshot } from "../../tax/repositories/tax-snapshot.repository.js";
import type { CreateTaxSnapshotInput } from "../../tax/validators/tax-snapshot.schema.js";
import { calculateTaxStack } from "../../tax/engine/tax-stack.engine.js";
import { calculateInvoiceTaxSnapshotSchema, type CalculateInvoiceTaxSnapshotInput } from "../validators/invoice-tax-calculation.schema.js";

export class InvoiceTaxSnapshotServiceError extends Error {
  constructor(
    readonly code:
      | "INVOICE_NOT_FOUND_OR_CHANGED"
      | "CURRENCY_NOT_SUPPORTED"
      | "NO_ACTIVE_TAX_RULES"
      | "INCOMPATIBLE_TAX_PRICE_MODES"
      | "AMBIGUOUS_TAX_TYPES"
      | "TAX_SNAPSHOT_MISMATCH",
    message: string,
  ) {
    super(message);
    this.name = "InvoiceTaxSnapshotServiceError";
  }
}

const ENGINE_VERSION = "zenox-finance-tax-engine/1.0.0";

export const invoiceTaxSnapshotService = {
  async calculateAndAttach(
    context: FinanceRequestContext,
    invoiceId: string,
    rawInput: CalculateInvoiceTaxSnapshotInput,
  ): Promise<{ snapshot: TaxCalculationSnapshot; invoice: Record<string, unknown> }> {
    const input = calculateInvoiceTaxSnapshotSchema.parse(rawInput);
    return withTenantTransaction(context.tenantId, async (client) => {
      // Lock the tenant-owned draft and compare the optimistic version inside the
      // same transaction as rule resolution, immutable snapshot insert and linkage.
      const locked = await client.query<{
        id: string;
        tenant_id: string;
        status: string;
        currency_code: string;
        currency_minor_unit: number;
        customer_id: string;
        updated_at: string;
        document_version: number;
        subtotal: string;
        discount_total: string;
        taxable_total: string;
        tax_total: string;
        grand_total: string;
      }>(
        `SELECT id, tenant_id, status, currency_code, currency_minor_unit, customer_id,
                updated_at::text AS updated_at, document_version, subtotal::text, discount_total::text,
                taxable_total::text, tax_total::text, grand_total::text
           FROM public.finance_invoices
          WHERE tenant_id = $1 AND id = $2 AND status = 'DRAFT'
            AND updated_at = $3::timestamptz
          FOR UPDATE`,
        [context.tenantId, invoiceId, input.expectedUpdatedAt],
      );
      const invoice = locked.rows[0];
      if (!invoice) {
        throw new InvoiceTaxSnapshotServiceError(
          "INVOICE_NOT_FOUND_OR_CHANGED",
          "The draft is unavailable or was changed. Reload the draft before attaching tax evidence.",
        );
      }

      const currency = await currencyRepository.findActiveByCode(invoice.currency_code.trim());
      if (!currency || currency.minorUnit !== invoice.currency_minor_unit) {
        throw new InvoiceTaxSnapshotServiceError(
          "CURRENCY_NOT_SUPPORTED",
          "The invoice currency is no longer active or its precision differs from the stored invoice.",
        );
      }

      const lines = await client.query<{
        id: string;
        line_number: number;
        description: string;
        quantity: string;
        unit_price: string;
        discount_percent: string;
        taxable_amount: string;
      }>(
        `SELECT id, line_number, description, quantity::text, unit_price::text,
                discount_percent::text, taxable_amount::text
           FROM public.finance_invoice_lines
          WHERE tenant_id = $1 AND invoice_id = $2
          ORDER BY line_number ASC`,
        [context.tenantId, invoiceId],
      );
      if (lines.rows.length === 0) {
        throw new Error("INVOICE_REQUIRES_AT_LEAST_ONE_LINE");
      }

      const rules = await taxRuleRepository.listEffectiveForJurisdiction(
        client,
        input.jurisdictionId,
        input.appliesTo,
        input.taxDate,
      );
      if (rules.length === 0) {
        throw new InvoiceTaxSnapshotServiceError(
          "NO_ACTIVE_TAX_RULES",
          "No active, effective tax rules exist for the selected jurisdiction and category; tax snapshot was not created.",
        );
      }
      if (rules.length > 50) throw new Error("TOO_MANY_TAX_COMPONENTS");

      const types = new Set(rules.map((rule) => rule.taxType));
      if (types.size > 1) {
        const nonWithholding = new Set(rules.map((rule) => rule.taxType).filter((type) => type !== "WITHHOLDING"));
        const supportedWithholdingStack = types.has("WITHHOLDING") && nonWithholding.size === 1 && types.size === 2;
        if (!supportedWithholdingStack) {
          throw new InvoiceTaxSnapshotServiceError(
            "AMBIGUOUS_TAX_TYPES",
            "Applicable rules contain multiple tax families without an explicit composition policy.",
          );
        }
      }
      const priceModes = new Set(rules.map((rule) => rule.priceMode));
      if (priceModes.size !== 1) {
        throw new InvoiceTaxSnapshotServiceError(
          "INCOMPATIBLE_TAX_PRICE_MODES",
          "Applicable tax rules mix inclusive and exclusive pricing.",
        );
      }
      const priceMode = rules[0]?.priceMode;
      if (!priceMode) throw new Error("NO_ACTIVE_TAX_RULES");

      const taxComponents = rules.map((rule) => ({
        ruleCode: rule.ruleCode,
        treatment: rule.treatment,
        ratePercent: rule.ratePercent,
        isCompound: rule.isCompound,
      }));

      const calculatedLines = lines.rows.map((line) => {
        const result = calculateTaxStack({
          amount: line.taxable_amount,
          priceMode,
          currency: currency.code,
          currencyDecimalPlaces: currency.minorUnit,
          taxes: taxComponents,
        });
        return {
          invoiceLineId: line.id,
          lineNumber: line.line_number,
          description: line.description,
          quantity: line.quantity,
          unitPrice: line.unit_price,
          discountPercent: line.discount_percent,
          taxableAmountBeforeTaxRules: line.taxable_amount,
          taxCalculation: result,
        };
      });

      const sum = (values: string[]): string =>
        values.reduce((total, value) => total.plus(new Decimal(value)), new Decimal(0))
          .toDecimalPlaces(currency.minorUnit, Decimal.ROUND_HALF_UP)
          .toFixed(currency.minorUnit);

      // Capture the pre-tax values before any update, so the immutable input
      // snapshot records exactly what the engine received.
      const inputTaxableTotal = sum(lines.rows.map((line) => line.taxable_amount));
      const taxableTotal = sum(calculatedLines.map((line) => line.taxCalculation.baseAmount));
      const provisionalLineInputs = lines.rows.map((line) => ({
        invoiceLineId: line.id,
        lineNumber: line.line_number,
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unit_price,
        discountPercent: line.discount_percent,
        taxableAmount: line.taxable_amount,
      }));

      // Apply authoritative per-line results in the same transaction as the
      // immutable snapshot insert and invoice linkage. Any failed row rolls back all.
      for (const line of calculatedLines) {
        const updatedLine = await client.query(
          `UPDATE public.finance_invoice_lines
              SET taxable_amount = $4,
                  tax_amount = $5,
                  total = $6
            WHERE tenant_id = $1 AND invoice_id = $2 AND id = $3`,
          [
            context.tenantId,
            invoiceId,
            line.invoiceLineId,
            line.taxCalculation.baseAmount,
            line.taxCalculation.taxTotal,
            line.taxCalculation.grandTotal,
          ],
        );
        if (updatedLine.rowCount !== 1) {
          throw new InvoiceTaxSnapshotServiceError(
            "TAX_SNAPSHOT_MISMATCH",
            "An invoice line changed while the tax snapshot was being calculated.",
          );
        }
      }
      const taxTotal = sum(calculatedLines.map((line) => line.taxCalculation.taxTotal));
      const withholdingTotal = sum(calculatedLines.map((line) => line.taxCalculation.withholdingTotal));
      const calculatedGrandTotal = sum(calculatedLines.map((line) => line.taxCalculation.grandTotal));
      const amountDue = sum(calculatedLines.map((line) => line.taxCalculation.amountDue));

      // The snapshot records the line identities and all pre-tax values, not only
      // an aggregate amount. Future rule edits cannot alter this evidence.
      const snapshotInput: CreateTaxSnapshotInput = {
        documentType: "INVOICE" as const,
        documentId: invoiceId,
        documentVersion: invoice.document_version,
        calculationPolicy: "INVOICE_TAX_SNAPSHOT_PER_LINE_V1",
        engineVersion: ENGINE_VERSION,
        taxDate: input.taxDate,
        currencyCode: currency.code,
        jurisdictionId: input.jurisdictionId,
        inputSnapshot: {
          invoiceId,
          invoiceVersionUpdatedAt: invoice.updated_at,
          documentVersion: invoice.document_version,
          appliesTo: input.appliesTo,
          priceMode,
          currencyCode: currency.code,
          currencyMinorUnit: currency.minorUnit,
          jurisdictionId: input.jurisdictionId,
          taxDate: input.taxDate,
          invoiceTotalsBeforeAuthoritativeTax: {
            subtotal: invoice.subtotal,
            discountTotal: invoice.discount_total,
            taxableTotal: invoice.taxable_total,
            inputTaxableTotal,
            provisionalTaxTotal: invoice.tax_total,
            provisionalGrandTotal: invoice.grand_total,
          },
          lines: provisionalLineInputs,
        },
        resultSnapshot: {
          perLine: calculatedLines,
          taxableTotal,
          taxTotal,
          withholdingTotal,
          grandTotal: calculatedGrandTotal,
          amountDue,
          currencyCode: currency.code,
          currencyMinorUnit: currency.minorUnit,
          calculationPolicy: "INVOICE_TAX_SNAPSHOT_PER_LINE_V1",
        },
        appliedRulesSnapshot: rules.map((rule) => ({
          id: rule.id,
          tenantId: rule.tenantId,
          jurisdictionId: rule.jurisdictionId,
          ruleCode: rule.ruleCode,
          name: rule.name,
          taxType: rule.taxType,
          treatment: rule.treatment,
          ratePercent: rule.ratePercent,
          priceMode: rule.priceMode,
          priority: rule.priority,
          isCompound: rule.isCompound,
          appliesTo: rule.appliesTo,
          sourceReference: rule.sourceReference,
          sourceUrl: rule.sourceUrl,
          version: rule.version,
          validFrom: rule.validFrom,
          validTo: rule.validTo,
        })),
      };

      const snapshot = await taxSnapshotRepository.create(
        client,
        context.tenantId,
        context.principal.id,
        currency.minorUnit,
        snapshotInput,
      );
      const linked = await client.query(
        `UPDATE public.finance_invoices
            SET tax_snapshot_id = $4,
                tax_snapshot_version = $5,
                tax_status = 'CALCULATED',
                taxable_total = $6,
                tax_total = $7,
                grand_total = $8,
                updated_at = clock_timestamp()
          WHERE tenant_id = $1
            AND id = $2
            AND status = 'DRAFT'
            AND updated_at = $3::timestamptz
            AND document_version = $9`,
        [
          context.tenantId,
          invoiceId,
          input.expectedUpdatedAt,
          snapshot.id,
          snapshot.documentVersion,
          taxableTotal,
          taxTotal,
          calculatedGrandTotal,
          invoice.document_version,
        ],
      );
      if (linked.rowCount !== 1) {
        throw new InvoiceTaxSnapshotServiceError(
          "TAX_SNAPSHOT_MISMATCH",
          "Invoice changed while tax evidence was being attached; transaction was rolled back.",
        );
      }
      return {
        snapshot,
        invoice: {
          id: invoiceId,
          taxSnapshotId: snapshot.id,
          taxSnapshotVersion: snapshot.documentVersion,
          taxStatus: "CALCULATED",
          taxTotals: { taxableTotal, taxTotal, withholdingTotal, grandTotal: calculatedGrandTotal, amountDue },
        },
      };
    });
  },
};
