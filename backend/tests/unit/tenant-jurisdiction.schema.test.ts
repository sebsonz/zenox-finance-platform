import { describe, expect, it } from "vitest";
import {
  createTenantJurisdictionAssignmentSchema,
  reviewTenantJurisdictionAssignmentSchema,
} from "../../src/modules/tax/schemas/tenant-jurisdiction.schema.js";

describe("tenant jurisdiction schemas", () => {
  it("accepts a dated jurisdiction assignment before separate evidence upload", () => {
    expect(createTenantJurisdictionAssignmentSchema.safeParse({
      jurisdictionId: "d9428888-122b-4b8b-9a3a-5e8b5e8a6f01",
      validFrom: "2026-01-01",
      basisType: "TAX_REGISTRATION",
      basisReference: "REG-2026-01",
    }).success).toBe(true);
  });

  it("rejects invalid periods and unknown fields", () => {
    expect(createTenantJurisdictionAssignmentSchema.safeParse({
      jurisdictionId: "d9428888-122b-4b8b-9a3a-5e8b5e8a6f01",
      validFrom: "2026-02-01",
      validTo: "2026-01-01",
      basisType: "TAX_REGISTRATION",
    }).success).toBe(false);
    expect(createTenantJurisdictionAssignmentSchema.safeParse({
      jurisdictionId: "d9428888-122b-4b8b-9a3a-5e8b5e8a6f01",
      validFrom: "2026-01-01",
      basisType: "TAX_REGISTRATION",
      tenantId: "attacker-selected",
    }).success).toBe(false);
  });

  it("requires a reason for a rejection", () => {
    expect(reviewTenantJurisdictionAssignmentSchema.safeParse({
      decision: "REJECT",
    }).success).toBe(false);
    expect(reviewTenantJurisdictionAssignmentSchema.safeParse({
      decision: "APPROVE",
    }).success).toBe(true);
  });
});
