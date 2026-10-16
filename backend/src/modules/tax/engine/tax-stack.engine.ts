import { Decimal } from "decimal.js";
import type {
  TaxComponentInput,
  TaxStackCalculationInput,
  TaxStackCalculationResult,
} from "../types/tax.types.js";

const DECIMAL_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
const MAX_DIGITS = 18;

function parse(value: string, field: string): Decimal {
  if (!DECIMAL_PATTERN.test(value) || value.replace(".", "").length > MAX_DIGITS) {
    throw new Error(`INVALID_${field.toUpperCase()}`);
  }
  const parsed = new Decimal(value);
  if (!parsed.isFinite()) throw new Error(`INVALID_${field.toUpperCase()}`);
  return parsed;
}

function money(value: Decimal, places: number): string {
  return value.toDecimalPlaces(places, Decimal.ROUND_HALF_UP).toFixed(places);
}

function effectiveRate(tax: TaxComponentInput): Decimal {
  const rate = parse(tax.ratePercent, "tax_rate_percent");
  if (rate.gt(100)) throw new Error("TAX_RATE_PERCENT_OUT_OF_RANGE");
  if (["ZERO_RATED", "EXEMPT", "REVERSE_CHARGE"].includes(tax.treatment) && !rate.isZero()) {
    throw new Error("NON_TAXABLE_TREATMENT_REQUIRES_ZERO_RATE");
  }
  return tax.treatment === "STANDARD" || tax.treatment === "REDUCED" || tax.treatment === "WITHHOLDING"
    ? rate
    : new Decimal(0);
}

/**
 * Computes multiple tax components in explicit order. For inclusive prices,
 * derives the net base by reversing the ordered tax multipliers. Compound
 * taxes apply to the base plus previously calculated non-withholding taxes.
 * Withholding is deducted from the amount due, not added to the invoice total.
 */
export function calculateTaxStack(input: TaxStackCalculationInput): TaxStackCalculationResult {
  if (!/^[A-Z]{3}$/.test(input.currency)) throw new Error("INVALID_CURRENCY_CODE");
  if (!Number.isInteger(input.currencyDecimalPlaces) ||
      input.currencyDecimalPlaces < 0 || input.currencyDecimalPlaces > 4) {
    throw new Error("INVALID_CURRENCY_PRECISION");
  }
  if (input.taxes.length > 50) throw new Error("TOO_MANY_TAX_COMPONENTS");

  const places = input.currencyDecimalPlaces;
  const amount = parse(input.amount, "amount").toDecimalPlaces(places, Decimal.ROUND_HALF_UP);
  const components = input.taxes.map((tax) => ({ tax, rate: effectiveRate(tax) }));
  const appliedTaxes = components.filter(({ tax }) => tax.treatment !== "WITHHOLDING");

  let base = amount;
  if (input.priceMode === "INCLUSIVE") {
    // Reverse the exact sequential model used below. The calculation policy
    // makes order and rounding deterministic for audit and reproducibility.
    let multiplier = new Decimal(1);
    let cumulativeRate = new Decimal(0);
    for (const { tax, rate } of appliedTaxes) {
      const contribution = tax.isCompound ? cumulativeRate.plus(1).times(rate.div(100)) : rate.div(100);
      multiplier = multiplier.plus(contribution);
      cumulativeRate = cumulativeRate.plus(contribution);
    }
    if (multiplier.lte(0)) throw new Error("INVALID_TAX_MULTIPLIER");
    base = amount.div(multiplier).toDecimalPlaces(places, Decimal.ROUND_HALF_UP);
  }

  let cumulativeTax = new Decimal(0);
  let withholdingTotal = new Decimal(0);
  const taxes = components.map(({ tax, rate }) => {
    const isWithholding = tax.treatment === "WITHHOLDING";
    const taxableBase = isWithholding
      ? base
      : tax.isCompound === true ? base.plus(cumulativeTax) : base;
    const taxAmount = taxableBase.times(rate).div(100)
      .toDecimalPlaces(places, Decimal.ROUND_HALF_UP);
    if (isWithholding) withholdingTotal = withholdingTotal.plus(taxAmount);
    else cumulativeTax = cumulativeTax.plus(taxAmount);
    return {
      ruleCode: tax.ruleCode,
      treatment: tax.treatment,
      ratePercent: rate.toString(),
      taxableBase: money(taxableBase, places),
      taxAmount: money(taxAmount, places),
      isCompound: tax.isCompound === true,
    };
  });

  const taxTotal = cumulativeTax.toDecimalPlaces(places, Decimal.ROUND_HALF_UP);
  const grandTotal = base.plus(taxTotal).toDecimalPlaces(places, Decimal.ROUND_HALF_UP);
  const amountDue = grandTotal.minus(withholdingTotal).toDecimalPlaces(places, Decimal.ROUND_HALF_UP);

  return {
    currency: input.currency,
    priceMode: input.priceMode,
    baseAmount: money(base, places),
    taxTotal: money(taxTotal, places),
    withholdingTotal: money(withholdingTotal, places),
    grandTotal: money(grandTotal, places),
    amountDue: money(amountDue, places),
    taxes,
    calculationPolicy: "TAX_STACK_HALF_UP_V1",
  };
}
