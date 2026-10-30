export const tenantExternalReferenceStatuses = ["ACTIVE", "REVOKED"] as const;
export type TenantExternalReferenceStatus = (typeof tenantExternalReferenceStatuses)[number];

export interface TenantExternalReference {
  readonly id: string;
  readonly tenantId: string;
  readonly externalSystemCode: string;
  readonly externalCompanyId: string;
  readonly status: TenantExternalReferenceStatus;
  readonly createdByType: "USER" | "PLATFORM" | "SERVICE";
  readonly createdByRef: string;
  readonly createdAt: string;
  readonly revokedAt: string | null;
  readonly revokedBy: string | null;
}

export interface ResolveTenantExternalReferenceInput {
  readonly externalSystemCode: string;
  readonly externalCompanyId: string;
}

export interface ResolveTenantExternalReferenceResult {
  readonly tenantId: string;
  readonly referenceId: string;
}
