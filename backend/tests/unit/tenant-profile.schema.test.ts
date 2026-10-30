import { describe, expect, it } from "vitest";
import {
  createTenantAddressSchema,
  tenantIdentifierSubmissionSchema,
  updateTenantProfileSchema,
} from "../../src/modules/tenants/schemas/tenant-profile.schema.js";

describe("tenant profile schemas", () => {
  it("normalizes company profile language and optional contact fields", () => {
    const parsed = updateTenantProfileSchema.parse({
      tradeName: " Zenox ",
      timezone: "Africa/Porto-Novo",
      primaryLanguage: "fr",
      supportedLanguages: ["fr", "en"],
      generalEmail: "finance@example.com",
    });
    expect(parsed.tradeName).toBe("Zenox");
    expect(parsed.primaryLanguage).toBe("fr");
    expect(parsed.supportedLanguages).toEqual(["fr", "en"]);
  });

  it("requires the primary language in the supported language list", () => {
    expect(updateTenantProfileSchema.safeParse({
      timezone: "Africa/Porto-Novo",
      primaryLanguage: "fr",
      supportedLanguages: ["en"],
    }).success).toBe(false);
  });

  it("validates address country and validity interval", () => {
    expect(createTenantAddressSchema.safeParse({
      addressType: "REGISTERED",
      addressLine1: "Rue 123",
      city: "Cotonou",
      countryCode: "bj",
      validFrom: "2026-01-01",
      validTo: "2025-12-31",
    }).success).toBe(false);
    expect(createTenantAddressSchema.parse({
      addressType: "REGISTERED",
      addressLine1: "Rue 123",
      city: "Cotonou",
      countryCode: "bj",
      validFrom: "2026-01-01",
    }).countryCode).toBe("BJ");
  });

  it("accepts typed identifier submissions but rejects unbounded or extra fields", () => {
    expect(tenantIdentifierSubmissionSchema.safeParse({
      identifierType: "TAX_ID",
      issuingCountryCode: "BJ",
      identifierValue: "IFU-123456",
    }).success).toBe(true);
    expect(tenantIdentifierSubmissionSchema.safeParse({
      identifierType: "TAX_ID",
      issuingCountryCode: "BJ",
      identifierValue: "IFU-123456",
      tenantId: "attacker-selected",
    }).success).toBe(false);
  });
});
