import type { AuthenticatedIntegrationPrincipal } from "../../integration-auth/types/authenticated-principal.js";

export function assertPrincipalCanAccessTenant(
  principal: AuthenticatedIntegrationPrincipal,
  tenantId: string,
): void {
  if (!principal.allowedTenantIds.includes(tenantId)) {
    const error = new Error("Tenant access denied");
    error.name = "TenantAccessDeniedError";
    throw error;
  }
}
