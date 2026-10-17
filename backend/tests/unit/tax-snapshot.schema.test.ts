import { describe, expect, it } from "vitest";
import { createTaxSnapshotSchema } from "../../src/modules/tax/validators/tax-snapshot.schema.js";

const validSnapshot = {
  documentType: "INVOICE",
  documentId: "7c58f5f7-2dca-4ed1-a0db-8cc7d77f5c41",
  documentVersion: 1,
  calculationPolicy: "TAX_STACK_HALF_UP_V1",
  engineVersion: "0.1.0",
  taxDate: "2026-10-16",
  currencyCode: "XOF",
  jurisdictionId: "d04a7b8a-c6c6-4f87-9b58-21e08d2d8f93",
  inputSnapshot: { amount: "10000", priceMode: "EXCLUSIVE" },
  resultSnapshot: { baseAmount: "10000", taxTotal: "1800", grandTotal: "11800" },
  appliedRulesSnapshot: [{ ruleCode: "BJ_VAT_18", version: 1, ratePercent: "18" }],
};

describe("createTaxSnapshotSchema", () => {
  it("accepts a complete tax snapshot", () => {
    expect(createTaxSnapshotSchema.parse(validSnapshot)).toMatchObject({
      documentType: "INVOICE",
      documentVersion: 1,
      currencyCode: "XOF",
    });
  });

  it("allows an absent jurisdiction for transactions without a resolved jurisdiction", () => {
    const withoutJurisdiction = Object.fromEntries(
      Object.entries(validSnapshot).filter(([key]) => key !== "jurisdictionId"),
    );
    expect(createTaxSnapshotSchema.safeParse(withoutJurisdiction).success).toBe(true);
  });

  it("rejects invalid document IDs, dates, and currency codes", () => {
    expect(createTaxSnapshotSchema.safeParse({ ...validSnapshot, documentId: "invoice-1" }).success).toBe(false);
    expect(createTaxSnapshotSchema.safeParse({ ...validSnapshot, taxDate: "16-10-2026" }).success).toBe(false);
    expect(createTaxSnapshotSchema.safeParse({ ...validSnapshot, currencyCode: "xof" }).success).toBe(false);
  });

  it("rejects empty policies, non-positive versions, and unknown fields", () => {
    expect(createTaxSnapshotSchema.safeParse({ ...validSnapshot, calculationPolicy: " " }).success).toBe(false);
    expect(createTaxSnapshotSchema.safeParse({ ...validSnapshot, documentVersion: 0 }).success).toBe(false);
    expect(createTaxSnapshotSchema.safeParse({ ...validSnapshot, tenantId: "7c58f5f7-2dca-4ed1-a0db-8cc7d77f5c41" }).success).toBe(false);
  });

  it("rejects non-object snapshots and excessive rule counts", () => {
    expect(createTaxSnapshotSchema.safeParse({ ...validSnapshot, inputSnapshot: [] }).success).toBe(false);
    expect(createTaxSnapshotSchema.safeParse({
      ...validSnapshot,
      appliedRulesSnapshot: Array.from({ length: 101 }, (_, index) => ({ ruleCode: `RULE_${index}` })),
    }).success).toBe(false);
  });
});
