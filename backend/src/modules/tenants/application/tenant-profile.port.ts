import type {
  TenantAddress,
  TenantProfile,
} from "../domain/tenant-profile.types.js";
import type { FinanceUserTenantContext } from "./tenant-profile-operation-context.js";
import type {
  CreateTenantAddressInput,
  UpdateTenantProfileInput,
} from "../schemas/tenant-profile.schema.js";

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
  updateProfile(context: FinanceUserTenantContext, input: UpdateTenantProfileInput): Promise<TenantProfile>;
  listActiveAddresses(context: FinanceUserTenantContext): Promise<readonly TenantAddress[]>;
  createAddress(context: FinanceUserTenantContext, input: CreateTenantAddressInput): Promise<TenantAddress>;
  checkProfileCompletion(context: FinanceUserTenantContext): Promise<TenantProfileCompletion>;
}
