import { Decimal } from "decimal.js";
import type { TaxCalculationInput, TaxCalculationResult } from "../types/tax.types.js";

const DECIMAL_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
const MAX_DIGITS = 18;

function parseAmount(value: string, field: string): Decimal {
  if (!DECIMAL_PATTERN.test(value) || value.replace(".", "").length > MAX_DIGITS) {
    throw new Error(`INVALID_${field.toUpperCase()}`);
  }
  const result = new Decimal(value);
  if (!result.isFinite()) throw new Error(`INVALID_${field.toUpperCase()}`);
  return result;
}

function format(value: Decimal, places: number): string {
  return value.toDecimalPlaces(places, Decimal.ROUND_HALF_UP).toFixed(places);
}

/**
 * Calculates a tax-exclusive amount. Exempt, zero-rated and reverse-charge
 * treatments produce no tax charged by the supplier; reverse-charge reporting
 * remains a separate accounting/tax obligation.
 */
export function calculateTax(input: TaxCalculationInput): TaxCalculationResult {
  if (!Number.isInteger(input.currencyDecimalPlaces) ||
      input.currencyDecimalPlaces < 0 || input.currencyDecimalPlaces > 4) {
    throw new Error("INVALID_CURRENCY_PRECISION");
  }

  const taxable = parseAmount(input.taxableAmount, "taxable_amount");
  const rate = parseAmount(input.ratePercent, "rate_percent");
  if (rate.gt(100)) throw new Error("TAX_RATE_PERCENT_OUT_OF_RANGE");

  if (input.treatment === "EXEMPT" || input.treatment === "ZERO_RATED" ||
      input.treatment === "REVERSE_CHARGE") {
    if (!rate.isZero()) throw new Error("NON_TAXABLE_TREATMENT_REQUIRES_ZERO_RATE");
  }

  const appliedRate = input.treatment === "STANDARD" || input.treatment === "REDUCED"
    ? rate
    : new Decimal(0);
  const roundedTaxable = taxable.toDecimalPlaces(input.currencyDecimalPlaces, Decimal.ROUND_HALF_UP);
  const tax = roundedTaxable.times(appliedRate).div(100)
    .toDecimalPlaces(input.currencyDecimalPlaces, Decimal.ROUND_HALF_UP);
  const total = roundedTaxable.plus(tax);

  return {
    treatment: input.treatment,
    ratePercent: appliedRate.toString(),
    taxableAmount: format(roundedTaxable, input.currencyDecimalPlaces),
    taxAmount: format(tax, input.currencyDecimalPlaces),
    totalAmount: format(total, input.currencyDecimalPlaces),
    calculationPolicy: "TAX_EXCLUSIVE_HALF_UP_V1",
  };
}
