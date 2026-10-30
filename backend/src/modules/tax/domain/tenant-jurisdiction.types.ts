export const tenantJurisdictionStatuses = [
  "PENDING_REVIEW",
  "ACTIVE",
  "SUSPENDED",
  "EXPIRED",
  "REVOKED",
] as const;

export type TenantJurisdictionStatus = (typeof tenantJurisdictionStatuses)[number];

export interface TenantJurisdictionAssignment {
  readonly id: string;
  readonly tenantId: string;
  readonly jurisdictionId: string;
  readonly status: TenantJurisdictionStatus;
  readonly validFrom: string;
  readonly validTo: string | null;
  readonly basisType: string;
  readonly basisReference: string | null;
  readonly evidenceDocumentId: string | null;
  readonly verifiedAt: string | null;
  readonly verifiedBy: string | null;
}

export interface TenantJurisdictionActivationCheck {
  readonly tenantId: string;
  readonly jurisdictionId: string;
  readonly effectiveDate: string;
  readonly assignmentStatus: TenantJurisdictionStatus;
  readonly jurisdictionReferenceActive: boolean;
  readonly applicableActiveRuleCount: number;
  readonly evidenceVerified: boolean;
}

export interface TenantJurisdictionActivationResult {
  readonly eligible: boolean;
  readonly reasonCodes: readonly (
    | "ASSIGNMENT_NOT_ACTIVE"
    | "OUTSIDE_VALIDITY_PERIOD"
    | "JURISDICTION_REFERENCE_INACTIVE"
    | "NO_ACTIVE_TAX_RULE"
    | "EVIDENCE_NOT_VERIFIED"
  )[];
}
