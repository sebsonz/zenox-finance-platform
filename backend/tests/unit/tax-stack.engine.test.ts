import { describe, expect, it } from "vitest";
import { calculateTaxStack } from "../../src/modules/tax/engine/tax-stack.engine.js";

describe("calculateTaxStack", () => {
  it("calculates multiple taxes on the same exclusive line", () => {
    const result = calculateTaxStack({
      amount: "1000",
      priceMode: "EXCLUSIVE",
      currency: "XOF",
      currencyDecimalPlaces: 0,
      taxes: [
        { ruleCode: "VAT18", treatment: "STANDARD", ratePercent: "18" },
        { ruleCode: "LOCAL2", treatment: "REDUCED", ratePercent: "2" },
      ],
    });
    expect(result).toMatchObject({
      baseAmount: "1000",
      taxTotal: "200",
      grandTotal: "1200",
      amountDue: "1200",
    });
  });

  it("extracts a single tax from an inclusive price", () => {
    const result = calculateTaxStack({
      amount: "118",
      priceMode: "INCLUSIVE",
      currency: "EUR",
      currencyDecimalPlaces: 2,
      taxes: [{ ruleCode: "VAT18", treatment: "STANDARD", ratePercent: "18" }],
    });
    expect(result).toMatchObject({ baseAmount: "100.00", taxTotal: "18.00", grandTotal: "118.00" });
  });

  it("supports compound tax in explicit order", () => {
    const result = calculateTaxStack({
      amount: "100",
      priceMode: "EXCLUSIVE",
      currency: "USD",
      currencyDecimalPlaces: 2,
      taxes: [
        { ruleCode: "TAX10", treatment: "STANDARD", ratePercent: "10" },
        { ruleCode: "TAX5_COMPOUND", treatment: "STANDARD", ratePercent: "5", isCompound: true },
      ],
    });
    expect(result.taxes[1]).toMatchObject({ taxableBase: "110.00", taxAmount: "5.50" });
    expect(result.grandTotal).toBe("115.50");
  });

  it("deducts withholding from amount due without reducing invoice total", () => {
    const result = calculateTaxStack({
      amount: "1000",
      priceMode: "EXCLUSIVE",
      currency: "XOF",
      currencyDecimalPlaces: 0,
      taxes: [
        { ruleCode: "VAT18", treatment: "STANDARD", ratePercent: "18" },
        { ruleCode: "WHT5", treatment: "WITHHOLDING", ratePercent: "5" },
      ],
    });
    expect(result).toMatchObject({
      taxTotal: "180",
      withholdingTotal: "50",
      grandTotal: "1180",
      amountDue: "1130",
    });
  });

  it("rejects a non-zero rate for an exempt component", () => {
    expect(() => calculateTaxStack({
      amount: "100",
      priceMode: "EXCLUSIVE",
      currency: "EUR",
      currencyDecimalPlaces: 2,
      taxes: [{ ruleCode: "EXEMPT", treatment: "EXEMPT", ratePercent: "5" }],
    })).toThrow("NON_TAXABLE_TREATMENT_REQUIRES_ZERO_RATE");
  });

  it("rounds monetary tax amounts half-up at the currency precision", () => {
    const result = calculateTaxStack({
      amount: "0.05",
      priceMode: "EXCLUSIVE",
      currency: "EUR",
      currencyDecimalPlaces: 2,
      taxes: [{ ruleCode: "VAT10", treatment: "STANDARD", ratePercent: "10" }],
    });
    expect(result.taxes[0]?.taxAmount).toBe("0.01");
    expect(result.grandTotal).toBe("0.06");
  });

  it("rejects tax rates above 100 percent", () => {
    expect(() => calculateTaxStack({
      amount: "100",
      priceMode: "EXCLUSIVE",
      currency: "EUR",
      currencyDecimalPlaces: 2,
      taxes: [{ ruleCode: "INVALID", treatment: "STANDARD", ratePercent: "100.01" }],
    })).toThrow("TAX_RATE_PERCENT_OUT_OF_RANGE");
  });

  it("rejects more than 50 tax components", () => {
    const taxes = Array.from({ length: 51 }, (_, index) => ({
      ruleCode: `TAX_${index}`,
      treatment: "STANDARD" as const,
      ratePercent: "1",
    }));
    expect(() => calculateTaxStack({
      amount: "100",
      priceMode: "EXCLUSIVE",
      currency: "EUR",
      currencyDecimalPlaces: 2,
      taxes,
    })).toThrow("TOO_MANY_TAX_COMPONENTS");
  });

  it("does not include withholding in the inclusive price extraction multiplier", () => {
    const result = calculateTaxStack({
      amount: "118.00",
      priceMode: "INCLUSIVE",
      currency: "EUR",
      currencyDecimalPlaces: 2,
      taxes: [
        { ruleCode: "VAT18", treatment: "STANDARD", ratePercent: "18" },
        { ruleCode: "WHT5", treatment: "WITHHOLDING", ratePercent: "5" },
      ],
    });
    expect(result.baseAmount).toBe("100.00");
    expect(result.taxTotal).toBe("18.00");
    expect(result.withholdingTotal).toBe("5.00");
    expect(result.amountDue).toBe("113.00");
  });

});