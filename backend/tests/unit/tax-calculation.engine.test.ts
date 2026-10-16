import { describe, expect, it } from "vitest";
import { calculateTax } from "../../src/modules/tax/engine/tax-calculation.engine.js";

describe("calculateTax", () => {
  it("calculates tax-exclusive XOF with half-up rounding", () => {
    expect(calculateTax({
      taxableAmount: "1800",
      ratePercent: "18",
      treatment: "STANDARD",
      currencyDecimalPlaces: 0,
    })).toMatchObject({
      taxableAmount: "1800",
      taxAmount: "324",
      totalAmount: "2124",
      calculationPolicy: "TAX_EXCLUSIVE_HALF_UP_V1",
    });
  });

  it("does not charge tax for zero-rated supplies", () => {
    expect(calculateTax({
      taxableAmount: "2500",
      ratePercent: "0",
      treatment: "ZERO_RATED",
      currencyDecimalPlaces: 0,
    }).taxAmount).toBe("0");
  });

  it("does not charge supplier tax for reverse charge", () => {
    expect(calculateTax({
      taxableAmount: "100.00",
      ratePercent: "0",
      treatment: "REVERSE_CHARGE",
      currencyDecimalPlaces: 2,
    })).toMatchObject({ taxAmount: "0.00", totalAmount: "100.00" });
  });

  it("rejects a non-zero rate for exempt treatment", () => {
    expect(() => calculateTax({
      taxableAmount: "100",
      ratePercent: "18",
      treatment: "EXEMPT",
      currencyDecimalPlaces: 0,
    })).toThrow("NON_TAXABLE_TREATMENT_REQUIRES_ZERO_RATE");
  });

  it("rejects negative and malformed amounts", () => {
    expect(() => calculateTax({
      taxableAmount: "-1",
      ratePercent: "18",
      treatment: "STANDARD",
      currencyDecimalPlaces: 0,
    })).toThrow("INVALID_TAXABLE_AMOUNT");
  });

  it("rejects unsupported currency precision", () => {
    expect(() => calculateTax({
      taxableAmount: "1",
      ratePercent: "18",
      treatment: "STANDARD",
      currencyDecimalPlaces: 5,
    })).toThrow("INVALID_CURRENCY_PRECISION");
  });
});
