import Decimal from "decimal.js";
import type {
  CalculatedInvoiceLine,
  CalculatedInvoiceTotals,
  InvoiceCalculationInput,
  InvoiceCalculationLineInput,
} from "../types/invoice-calculation.types.js";

const DECIMAL_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
const MAX_AMOUNT_DIGITS = 18;

function decimal(value: string, field: string): Decimal {
  if (!DECIMAL_PATTERN.test(value)) {
    throw new Error(`INVALID_${field.toUpperCase()}`);
  }
  const digits = value.replace(".", "");
  if (digits.length > MAX_AMOUNT_DIGITS) throw new Error(`EXCESSIVE_${field.toUpperCase()}`);
  const parsed = new Decimal(value);
  if (!parsed.isFinite()) throw new Error(`INVALID_${field.toUpperCase()}`);
  return parsed;
}

function money(value: Decimal, places: number): string {
  return value.toDecimalPlaces(places, Decimal.ROUND_HALF_UP).toFixed(places);
}

function calculateLine(
  input: InvoiceCalculationLineInput,
  places: number,
): CalculatedInvoiceLine {
  const quantity = decimal(input.quantity, "quantity");
  const unitPrice = decimal(input.unitPrice, "unit_price");
  const discountPercent = decimal(input.discountPercent ?? "0", "discount_percent");
  const taxRatePercent = decimal(input.taxRatePercent, "tax_rate_percent");

  if (quantity.lte(0)) throw new Error("QUANTITY_MUST_BE_POSITIVE");
  if (unitPrice.lt(0)) throw new Error("UNIT_PRICE_MUST_NOT_BE_NEGATIVE");
  if (discountPercent.lt(0) || discountPercent.gt(100)) throw new Error("DISCOUNT_PERCENT_OUT_OF_RANGE");
  if (taxRatePercent.lt(0) || taxRatePercent.gt(100)) throw new Error("TAX_RATE_PERCENT_OUT_OF_RANGE");

  const rawSubtotal = quantity.times(unitPrice);
  const rawDiscount = rawSubtotal.times(discountPercent).div(100);
  const subtotal = rawSubtotal.toDecimalPlaces(places, Decimal.ROUND_HALF_UP);
  const discountAmount = rawDiscount.toDecimalPlaces(places, Decimal.ROUND_HALF_UP);
  const taxableAmount = Decimal.max(0, subtotal.minus(discountAmount));
  const taxAmount = taxableAmount.times(taxRatePercent).div(100)
    .toDecimalPlaces(places, Decimal.ROUND_HALF_UP);
  const total = taxableAmount.plus(taxAmount);

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
  const subtotal = lines.reduce((sum, line) => sum.plus(line.subtotal), new Decimal(0));
  const discountTotal = lines.reduce((sum, line) => sum.plus(line.discountAmount), new Decimal(0));
  const taxableTotal = lines.reduce((sum, line) => sum.plus(line.taxableAmount), new Decimal(0));
  const taxTotal = lines.reduce((sum, line) => sum.plus(line.taxAmount), new Decimal(0));
  const grandTotal = lines.reduce((sum, line) => sum.plus(line.total), new Decimal(0));
  const places = input.currencyDecimalPlaces;

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
