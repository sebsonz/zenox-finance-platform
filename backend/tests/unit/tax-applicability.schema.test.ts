import { describe, expect, it } from "vitest";
import {
  taxApplicabilityConditionsSchema,
  taxBusinessFactsSchema,
} from "../../src/modules/tax/validators/tax-applicability.schema.js";

describe("tax applicability schema", () => {
  it("accepts a bounded declarative condition set", () => {
    expect(taxApplicabilityConditionsSchema.safeParse({
      schemaVersion: 1,
      all: [
        { field: "transactionType", operator: "EQ", value: "SERVICES" },
        { field: "supplierIfuStatus", operator: "IN", value: ["REGISTERED", "NOT_REGISTERED"] },
      ],
    }).success).toBe(true);
  });

  it("rejects unsupported fields, operators, extra properties and oversized arrays", () => {
    expect(taxApplicabilityConditionsSchema.safeParse({
      schemaVersion: 1,
      all: [{ field: "tenantId", operator: "EQ", value: "x" }],
    }).success).toBe(false);
    expect(taxApplicabilityConditionsSchema.safeParse({
      schemaVersion: 1,
      all: [{ field: "transactionType", operator: "REGEX", value: ".*" }],
    }).success).toBe(false);
    expect(taxApplicabilityConditionsSchema.safeParse({
      schemaVersion: 1,
      all: [{ field: "transactionType", operator: "EQ", value: "SERVICES", sql: "select 1" }],
    }).success).toBe(false);
    expect(taxApplicabilityConditionsSchema.safeParse({
      schemaVersion: 1,
      all: Array.from({ length: 31 }, () => ({
        field: "transactionType", operator: "EQ", value: "SERVICES",
      })),
    }).success).toBe(false);
  });

  it("validates only explicitly supported business facts", () => {
    expect(taxBusinessFactsSchema.safeParse({
      transactionType: "SERVICES",
      supplierIfuStatus: "REGISTERED",
      isImport: false,
      customerCountryCode: "FR",
    }).success).toBe(true);
    expect(taxBusinessFactsSchema.safeParse({ arbitraryUserField: "anything" }).success).toBe(false);
  });
});
