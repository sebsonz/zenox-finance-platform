import { Decimal } from "decimal.js";

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

const DECIMAL_STRING = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

export function exactAmount(value: string): Decimal {
  if (!DECIMAL_STRING.test(value)) throw new Error("INVALID_AMOUNT");
  const amount = new Decimal(value);
  if (!amount.isFinite() || amount.lte(0)) throw new Error("INVALID_AMOUNT");
  return amount;
}

export function ensureAllocatable(amount: string, paymentAvailable: string, invoiceBalance: string): void {
  const requested = exactAmount(amount);
  const available = new Decimal(paymentAvailable);
  const balance = new Decimal(invoiceBalance);
  if (available.lt(0) || balance.lt(0)) throw new Error("NEGATIVE_BALANCE_INVARIANT");
  if (requested.gt(available)) throw new Error("PAYMENT_AMOUNT_EXCEEDED");
  if (requested.gt(balance)) throw new Error("INVOICE_BALANCE_EXCEEDED");
}

export function subtractAmounts(total: string, used: string): string {
  const result = new Decimal(total).minus(new Decimal(used));
  if (result.isNegative()) throw new Error("NEGATIVE_BALANCE_INVARIANT");
  return result.toString();
}
