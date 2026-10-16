import { describe, expect, it } from "vitest";
import { assertPrincipalCanAccessTenant } from "../../src/modules/tenants/services/tenant-access.service.js";
import type { AuthenticatedIntegrationPrincipal } from "../../src/modules/integration-auth/types/authenticated-principal.js";

const principal: AuthenticatedIntegrationPrincipal = {
  id: "principal-1",
  principalCode: "zenox-fret-v2",
  displayName: "ZENOX FRET V2",
  scopes: ["invoices:create"],
  allowedTenantIds: ["tenant-a"],
};

describe("tenant access policy", () => {
  it("allows a tenant explicitly assigned to the integration principal", () => {
    expect(() => assertPrincipalCanAccessTenant(principal, "tenant-a")).not.toThrow();
  });

  it("rejects a tenant not assigned to the integration principal", () => {
    expect(() => assertPrincipalCanAccessTenant(principal, "tenant-b")).toThrow("Tenant access denied");
  });
});
