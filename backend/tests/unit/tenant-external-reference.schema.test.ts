import { describe, expect, it } from "vitest";
import {
  createTenantExternalReferenceSchema,
  resolveTenantExternalReferenceSchema,
} from "../../src/modules/integrations/schemas/tenant-external-reference.schema.js";

describe("tenant external reference schemas", () => {
  it("normalizes system codes and preserves opaque external identifiers", () => {
    expect(createTenantExternalReferenceSchema.parse({
      externalSystemCode: " zenox_fret ",
      externalCompanyId: "company-00042",
    })).toEqual({
      externalSystemCode: "ZENOX_FRET",
      externalCompanyId: "company-00042",
    });
  });

  it("rejects extra tenant selection and malformed identifiers", () => {
    expect(createTenantExternalReferenceSchema.safeParse({
      externalSystemCode: "ZENOX_FRET",
      externalCompanyId: "company-00042",
      tenantId: "attacker-selected",
    }).success).toBe(false);
    expect(resolveTenantExternalReferenceSchema.safeParse({
      externalSystemCode: "ZENOX_FRET",
      externalCompanyId: "",
    }).success).toBe(false);
  });
});
