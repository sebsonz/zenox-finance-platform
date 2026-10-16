import { describe, expect, it } from "vitest";
import { taxRuleSchema } from "../../src/modules/tax/validators/tax-rule.schema.js";

const baseRule = {
  jurisdictionId: "7c58f5f7-2dca-4ed1-a0db-8cc7d77f5c41",
  ruleCode: "BJ_VAT_18",
  name: "TVA standard",
  taxType: "VAT",
  treatment: "STANDARD",
  ratePercent: "18",
  validFrom: "2026-01-01",
};

describe("taxRuleSchema", () => {
  it("accepts a valid effective-dated tax rule and defaults safe fields", () => {
    expect(taxRuleSchema.parse(baseRule)).toMatchObject({
      jurisdictionId: baseRule.jurisdictionId,
      priceMode: "EXCLUSIVE",
      priority: 100,
      appliesTo: "GOODS",
      status: "DRAFT",
    });
  });

  it("rejects a non-zero rate for exempt treatment", () => {
    expect(taxRuleSchema.safeParse({
      ...baseRule,
      treatment: "EXEMPT",
      ratePercent: "18",
    }).success).toBe(false);
  });

  it("rejects withholding treatment paired with a non-withholding tax type", () => {
    expect(taxRuleSchema.safeParse({
      ...baseRule,
      treatment: "WITHHOLDING",
      taxType: "VAT",
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

  it("rejects rates with more precision than the database contract", () => {
    expect(taxRuleSchema.safeParse({ ...baseRule, ratePercent: "18.1234567" }).success).toBe(false);
  });
});
