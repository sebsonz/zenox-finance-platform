import { describe, expect, it } from "vitest";
import { calculateInvoiceTotals } from "../../src/modules/invoices/engine/invoice-calculation.engine.js";

describe("calculateInvoiceTotals", () => {
  it("calculates subtotal, discount, tax and total with explicit line rounding", () => {
    const result = calculateInvoiceTotals({
      currency: "XOF",
      currencyDecimalPlaces: 0,
      lines: [
        { quantity: "2", unitPrice: "1000", discountPercent: "10", taxRatePercent: "18" },
        { quantity: "1", unitPrice: "500", taxRatePercent: "0" }
      ]
    });

    expect(result.subtotal).toBe("2500");
    expect(result.discountTotal).toBe("200");
    expect(result.taxableTotal).toBe("2300");
    expect(result.taxTotal).toBe("360");
    expect(result.grandTotal).toBe("2660");
    expect(result.calculationPolicy).toBe("LINE_HALF_UP_TAX_EXCLUSIVE_V1");
  });

  it("does not use binary floating point for decimal currency arithmetic", () => {
    const result = calculateInvoiceTotals({
      currency: "EUR",
      currencyDecimalPlaces: 2,
      lines: [{ quantity: "3", unitPrice: "19.99", taxRatePercent: "20" }]
    });
    expect(result.subtotal).toBe("59.97");
    expect(result.taxTotal).toBe("11.99");
    expect(result.grandTotal).toBe("71.96");
  });

  it("rejects invalid quantity, tax, currency and empty invoices", () => {
    expect(() => calculateInvoiceTotals({ currency: "XOF", currencyDecimalPlaces: 0, lines: [] })).toThrow("INVOICE_REQUIRES_AT_LEAST_ONE_LINE");
    expect(() => calculateInvoiceTotals({ currency: "xof", currencyDecimalPlaces: 0, lines: [{ quantity: "1", unitPrice: "1", taxRatePercent: "0" }] })).toThrow("INVALID_CURRENCY_CODE");
    expect(() => calculateInvoiceTotals({ currency: "XOF", currencyDecimalPlaces: 0, lines: [{ quantity: "0", unitPrice: "1", taxRatePercent: "0" }] })).toThrow("QUANTITY_MUST_BE_POSITIVE");
    expect(() => calculateInvoiceTotals({ currency: "XOF", currencyDecimalPlaces: 0, lines: [{ quantity: "1", unitPrice: "1", taxRatePercent: "101" }] })).toThrow("TAX_RATE_PERCENT_OUT_OF_RANGE");
  });
});
