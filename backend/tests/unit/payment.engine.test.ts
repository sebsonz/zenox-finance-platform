import { describe, expect, it } from "vitest";
import { ensureAllocatable, exactAmount, subtractAmounts } from "../../src/modules/payments/engine/payment.engine.js";

describe("payment allocation engine", () => {
  it("parses exact decimal strings without converting through Number", () => {
    expect(exactAmount("9007199254740993.12345678").toString()).toBe("9007199254740993.12345678");
    expect(subtractAmounts("100.00000000", "0.00000001")).toBe("99.99999999");
  });

  it("rejects zero, negative and malformed amounts", () => {
    for (const value of ["0", "0.000", "-1", "01", "1e3", "NaN", "Infinity"]) {
      expect(() => exactAmount(value)).toThrow("INVALID_AMOUNT");
    }
  });

  it("prevents over-allocation against either available payment or invoice balance", () => {
    expect(() => ensureAllocatable("80", "79.99", "100")).toThrow("PAYMENT_AMOUNT_EXCEEDED");
    expect(() => ensureAllocatable("100.01", "200", "100")).toThrow("INVOICE_BALANCE_EXCEEDED");
    expect(() => ensureAllocatable("12.34", "12.34", "12.34")).not.toThrow();
  });

  it("fails closed when an existing balance is negative", () => {
    expect(() => ensureAllocatable("1", "-0.01", "10")).toThrow("NEGATIVE_BALANCE_INVARIANT");
    expect(() => subtractAmounts("1", "1.01")).toThrow("NEGATIVE_BALANCE_INVARIANT");
  });
});
