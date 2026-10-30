import { describe, expect, it } from "vitest";
import { taxJurisdictionListQuerySchema } from "../../src/modules/tax/schemas/tax-jurisdiction-list.schema.js";

describe("taxJurisdictionListQuerySchema", () => {
  it("applies safe pagination defaults", () => {
    expect(taxJurisdictionListQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 25,
    });
  });

  it("accepts an ISO country code and known jurisdiction level", () => {
    expect(taxJurisdictionListQuerySchema.parse({
      countryCode: "BJ",
      level: "COUNTRY",
      page: "2",
      pageSize: "50",
    })).toEqual({
      countryCode: "BJ",
      level: "COUNTRY",
      page: 2,
      pageSize: 50,
    });
  });

  it("rejects malformed country codes, unknown levels and extra query fields", () => {
    expect(taxJurisdictionListQuerySchema.safeParse({ countryCode: "ben" }).success).toBe(false);
    expect(taxJurisdictionListQuerySchema.safeParse({ level: "DISTRICT" }).success).toBe(false);
    expect(taxJurisdictionListQuerySchema.safeParse({ tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }).success).toBe(false);
  });

  it("bounds pagination to prevent unbounded result sets", () => {
    expect(taxJurisdictionListQuerySchema.safeParse({ pageSize: "5000" }).success).toBe(false);
    expect(taxJurisdictionListQuerySchema.safeParse({ page: "0" }).success).toBe(false);
  });
});
