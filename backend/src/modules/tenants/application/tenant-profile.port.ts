import type {
  TenantAddress,
  TenantProfile,
} from "../domain/tenant-profile.types.js";

export interface TenantProfileCompletion {
  readonly complete: boolean;
  readonly missingRequirements: readonly string[];
}

/**
 * Application boundary exported by the Tenants module.
 * Implementations must derive tenant access from a trusted server context.
 */
export interface TenantProfilePort {
  getProfile(tenantId: string): Promise<TenantProfile | null>;
  listActiveAddresses(tenantId: string): Promise<readonly TenantAddress[]>;
  checkProfileCompletion(tenantId: string): Promise<TenantProfileCompletion>;
}
