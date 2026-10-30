import type {
  TenantJurisdictionActivationResult,
  TenantJurisdictionAssignment,
} from "../domain/tenant-jurisdiction.types.js";

export interface CheckTenantJurisdictionInput {
  readonly tenantId: string;
  readonly jurisdictionId: string;
  readonly effectiveDate: string;
}

/**
 * Application boundary exported by Tax for Registration and tax-consuming use cases.
 * A positive result is necessary but not sufficient for legal-compliance claims.
 */
export interface TenantJurisdictionPort {
  checkActivationEligibility(
    input: CheckTenantJurisdictionInput,
  ): Promise<TenantJurisdictionActivationResult>;
  listActiveAssignments(
    tenantId: string,
    effectiveDate: string,
  ): Promise<readonly TenantJurisdictionAssignment[]>;
}
