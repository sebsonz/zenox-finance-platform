import { describe, expect, it } from "vitest";
import { taxRuleSchema } from "../../src/modules/tax/validators/tax-rule.schema.js";

const baseRule = {
  code: "BJ_VAT_18",
  name: "TVA standard",
  countryCode: "bj",
  treatment: "STANDARD",
  ratePercent: "18",
  validFrom: "2026-01-01",
};

describe("taxRuleSchema", () => {
  it("normalizes country code and accepts a valid rule", () => {
    expect(taxRuleSchema.parse(baseRule).countryCode).toBe("BJ");
  });

  it("rejects a non-zero rate for exempt treatment", () => {
    expect(taxRuleSchema.safeParse({
      ...baseRule,
      treatment: "EXEMPT",
      ratePercent: "18",
    }).success).toBe(false);
  });

  it("rejects a validity end date before the start date", () => {
    expect(taxRuleSchema.safeParse({
      ...baseRule,
      validFrom: "2026-06-01",
      validTo: "2026-05-31",
    }).success).toBe(false);
  });

  it("rejects unknown properties", () => {
    expect(taxRuleSchema.safeParse({ ...baseRule, tenantId: "tenant" }).success).toBe(false);
  });
});
