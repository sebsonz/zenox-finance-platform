import type {
  TenantAddress,
  TenantProfile,
} from "../domain/tenant-profile.types.js";
import type { FinanceUserTenantContext } from "./tenant-profile-operation-context.js";

export interface TenantProfileCompletion {
  readonly complete: boolean;
  readonly missingRequirements: readonly string[];
}

/**
 * Application boundary exported by the Tenants module.
 * Tenant scope is always taken from a trusted server-side operation context.
 */
export interface TenantProfilePort {
  getProfile(context: FinanceUserTenantContext): Promise<TenantProfile | null>;
  listActiveAddresses(context: FinanceUserTenantContext): Promise<readonly TenantAddress[]>;
  checkProfileCompletion(context: FinanceUserTenantContext): Promise<TenantProfileCompletion>;
}
