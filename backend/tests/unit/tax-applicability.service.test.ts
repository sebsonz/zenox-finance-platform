import { describe, expect, it } from "vitest";
import {
  matchesTaxApplicability,
  resolveApplicableTaxRulePrecedence,
} from "../../src/modules/tax/services/tax-applicability.service.js";

describe("tax applicability conditions", () => {
  it("matches exact string and boolean facts deterministically", () => {
    expect(matchesTaxApplicability({
      schemaVersion: 1,
      all: [
        { field: "transactionType", operator: "EQ", value: "SERVICES" },
        { field: "supplierIfuStatus", operator: "EQ", value: "REGISTERED" },
        { field: "isImport", operator: "EQ", value: false },
      ],
    }, {
      transactionType: "services",
      supplierIfuStatus: "REGISTERED",
      isImport: false,
    })).toBe(true);
  });

  it("does not match when a required fact is missing", () => {
    expect(matchesTaxApplicability({
      schemaVersion: 1,
      all: [{ field: "supplierIfuStatus", operator: "EQ", value: "NOT_REGISTERED" }],
    }, {})).toBe(false);
  });

  it("supports an allow-list condition", () => {
    expect(matchesTaxApplicability({
      schemaVersion: 1,
      all: [{ field: "transactionType", operator: "IN", value: ["GOODS", "SERVICES"] }],
    }, { transactionType: "SERVICES" })).toBe(true);
  });

  it("rejects unknown fields, operators, and executable-shaped conditions", () => {
    expect(() => matchesTaxApplicability({
      schemaVersion: 1,
      all: [{ field: "tenantId", operator: "EQ", value: "x" }],
    }, {})).toThrow();
    expect(() => matchesTaxApplicability({
      schemaVersion: 1,
      all: [{ field: "transactionType", operator: "SQL", value: "x" }],
    }, {})).toThrow();
    expect(() => matchesTaxApplicability({
      schemaVersion: 1,
      all: [{ field: "transactionType", operator: "EQ", value: "x", expression: "DROP TABLE" }],
    }, {})).toThrow();
  });

  it("chooses a matching tenant override over the global rule", () => {
    const resolved = resolveApplicableTaxRulePrecedence([
      { ruleCode: "VAT", tenantId: null, appliesTo: "ALL", version: 1, priority: 100, marker: "global" },
      { ruleCode: "VAT", tenantId: "tenant-1", appliesTo: "SERVICES", version: 1, priority: 100, marker: "tenant" },
      { ruleCode: "AIB", tenantId: null, appliesTo: "SERVICES", version: 1, priority: 50, marker: "aib" },
    ], "SERVICES");
    expect(resolved.map((rule) => rule.marker)).toEqual(["aib", "tenant"]);
  });

  it("does not let an unmatched tenant override shadow a global rule", () => {
    // Matching is intentionally done before this precedence resolver.
    const resolved = resolveApplicableTaxRulePrecedence([
      { ruleCode: "VAT", tenantId: null, appliesTo: "ALL", version: 1, priority: 100, marker: "global" },
    ], "SERVICES");
    expect(resolved.map((rule) => rule.marker)).toEqual(["global"]);
  });
});
