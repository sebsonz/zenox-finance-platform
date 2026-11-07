import { Decimal } from "decimal.js";
import type {
  CalculatedInvoiceLine,
  CalculatedInvoiceTotals,
  InvoiceCalculationInput,
  InvoiceCalculationLineInput,
} from "../types/invoice-calculation.types.js";

// Keep invoice arithmetic isolated from Decimal.js global configuration used by
// other modules. Forty significant digits cover the supported database range,
// multiplication intermediates and aggregation of up to 500 invoice lines.
const CalculationDecimal = Decimal.clone({
  precision: 40,
  rounding: Decimal.ROUND_HALF_UP,
});

const DECIMAL_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
const MAX_MONEY_INTEGER_DIGITS = 16;
const MAX_MONEY_SCALE = 8;
const MAX_PERCENT_INTEGER_DIGITS = 3;
const MAX_PERCENT_SCALE = 6;

function decimal(
  value: string,
  field: string,
  maxIntegerDigits: number,
  maxScale: number,
): Decimal {
  if (!DECIMAL_PATTERN.test(value)) {
    throw new Error(`INVALID_${field.toUpperCase()}`);
  }

  const [integerPart = "", fractionalPart = ""] = value.split(".");
  if (integerPart.length > maxIntegerDigits || fractionalPart.length > maxScale) {
    throw new Error(`EXCESSIVE_${field.toUpperCase()}_PRECISION`);
  }

  const parsed = new CalculationDecimal(value);
  if (!parsed.isFinite()) throw new Error(`INVALID_${field.toUpperCase()}`);
  return parsed;
}

function assertFitsMoneyStorage(value: Decimal, field: string): void {
  // finance_invoice_lines and finance_invoices use numeric(24, 8).
  // Reject overflow before PostgreSQL can round or reject persisted values.
  if (value.abs().gte(new CalculationDecimal(10).pow(MAX_MONEY_INTEGER_DIGITS))) {
    throw new Error(`INVOICE_${field.toUpperCase()}_EXCEEDS_STORAGE_LIMIT`);
  }
}

function money(value: Decimal, places: number): string {
  return value.toDecimalPlaces(places, CalculationDecimal.ROUND_HALF_UP).toFixed(places);
}

function calculateLine(
  input: InvoiceCalculationLineInput,
  places: number,
): CalculatedInvoiceLine {
  const quantity = decimal(input.quantity, "quantity", MAX_MONEY_INTEGER_DIGITS, MAX_MONEY_SCALE);
  const unitPrice = decimal(input.unitPrice, "unit_price", MAX_MONEY_INTEGER_DIGITS, MAX_MONEY_SCALE);
  const discountPercent = decimal(
    input.discountPercent ?? "0",
    "discount_percent",
    MAX_PERCENT_INTEGER_DIGITS,
    MAX_PERCENT_SCALE,
  );
  const taxRatePercent = decimal(
    input.taxRatePercent,
    "tax_rate_percent",
    MAX_PERCENT_INTEGER_DIGITS,
    MAX_PERCENT_SCALE,
  );

  if (quantity.lte(0)) throw new Error("QUANTITY_MUST_BE_POSITIVE");
  if (unitPrice.lt(0)) throw new Error("UNIT_PRICE_MUST_NOT_BE_NEGATIVE");
  if (discountPercent.lt(0) || discountPercent.gt(100)) throw new Error("DISCOUNT_PERCENT_OUT_OF_RANGE");
  if (taxRatePercent.lt(0) || taxRatePercent.gt(100)) throw new Error("TAX_RATE_PERCENT_OUT_OF_RANGE");

  const rawSubtotal = quantity.times(unitPrice);
  const rawDiscount = rawSubtotal.times(discountPercent).div(100);
  const subtotal = rawSubtotal.toDecimalPlaces(places, CalculationDecimal.ROUND_HALF_UP);
  const discountAmount = rawDiscount.toDecimalPlaces(places, CalculationDecimal.ROUND_HALF_UP);
  const taxableAmount = CalculationDecimal.max(0, subtotal.minus(discountAmount));
  const taxAmount = taxableAmount.times(taxRatePercent).div(100)
    .toDecimalPlaces(places, CalculationDecimal.ROUND_HALF_UP);
  const total = taxableAmount.plus(taxAmount);

  assertFitsMoneyStorage(subtotal, "subtotal");
  assertFitsMoneyStorage(discountAmount, "discount_amount");
  assertFitsMoneyStorage(taxableAmount, "taxable_amount");
  assertFitsMoneyStorage(taxAmount, "tax_amount");
  assertFitsMoneyStorage(total, "line_total");

  return {
    quantity: quantity.toString(),
    unitPrice: unitPrice.toString(),
    discountPercent: discountPercent.toString(),
    taxRatePercent: taxRatePercent.toString(),
    subtotal: money(subtotal, places),
    discountAmount: money(discountAmount, places),
    taxableAmount: money(taxableAmount, places),
    taxAmount: money(taxAmount, places),
    total: money(total, places),
  };
}

export function calculateInvoiceTotals(input: InvoiceCalculationInput): CalculatedInvoiceTotals {
  if (!/^[A-Z]{3}$/.test(input.currency)) throw new Error("INVALID_CURRENCY_CODE");
  if (!Number.isInteger(input.currencyDecimalPlaces) || input.currencyDecimalPlaces < 0 || input.currencyDecimalPlaces > 4) {
    throw new Error("INVALID_CURRENCY_PRECISION");
  }
  if (input.lines.length === 0) throw new Error("INVOICE_REQUIRES_AT_LEAST_ONE_LINE");
  if (input.lines.length > 500) throw new Error("TOO_MANY_INVOICE_LINES");

  const lines = input.lines.map((line) => calculateLine(line, input.currencyDecimalPlaces));
  const subtotal = lines.reduce((sum, line) => sum.plus(line.subtotal), new CalculationDecimal(0));
  const discountTotal = lines.reduce((sum, line) => sum.plus(line.discountAmount), new CalculationDecimal(0));
  const taxableTotal = lines.reduce((sum, line) => sum.plus(line.taxableAmount), new CalculationDecimal(0));
  const taxTotal = lines.reduce((sum, line) => sum.plus(line.taxAmount), new CalculationDecimal(0));
  const grandTotal = lines.reduce((sum, line) => sum.plus(line.total), new CalculationDecimal(0));
  const places = input.currencyDecimalPlaces;

  assertFitsMoneyStorage(subtotal, "invoice_subtotal");
  assertFitsMoneyStorage(discountTotal, "invoice_discount_total");
  assertFitsMoneyStorage(taxableTotal, "invoice_taxable_total");
  assertFitsMoneyStorage(taxTotal, "invoice_tax_total");
  assertFitsMoneyStorage(grandTotal, "invoice_grand_total");

  return {
    currency: input.currency,
    subtotal: money(subtotal, places),
    discountTotal: money(discountTotal, places),
    taxableTotal: money(taxableTotal, places),
    taxTotal: money(taxTotal, places),
    grandTotal: money(grandTotal, places),
    lines,
    calculationPolicy: "LINE_HALF_UP_TAX_EXCLUSIVE_V1",
  };
}
