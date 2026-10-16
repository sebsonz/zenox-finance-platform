import Decimal from "decimal.js";

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export type DecimalString = string;

const DECIMAL_STRING = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

export function parseDecimal(value: string): Decimal {
  if (!DECIMAL_STRING.test(value)) {
    throw new Error("Invalid decimal string");
  }
  const result = new Decimal(value);
  if (!result.isFinite()) throw new Error("Decimal must be finite");
  return result;
}

export function addMoney(left: DecimalString, right: DecimalString): DecimalString {
  return parseDecimal(left).plus(parseDecimal(right)).toString();
}

export function multiplyMoney(
  quantity: DecimalString,
  unitPrice: DecimalString,
): DecimalString {
  return parseDecimal(quantity).times(parseDecimal(unitPrice)).toString();
}

export function roundMoney(value: DecimalString, decimalPlaces: number): DecimalString {
  if (!Number.isInteger(decimalPlaces) || decimalPlaces < 0 || decimalPlaces > 6) {
    throw new Error("Unsupported currency precision");
  }
  return parseDecimal(value).toDecimalPlaces(decimalPlaces, Decimal.ROUND_HALF_UP).toFixed(decimalPlaces);
}
