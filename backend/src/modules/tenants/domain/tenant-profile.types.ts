export const tenantAddressTypes = ["REGISTERED", "BUSINESS", "BILLING", "OTHER"] as const;
export type TenantAddressType = (typeof tenantAddressTypes)[number];

export const tenantAddressStatuses = ["ACTIVE", "ARCHIVED"] as const;
export type TenantAddressStatus = (typeof tenantAddressStatuses)[number];

export const tenantIdentifierStatuses = [
  "PENDING_VERIFICATION",
  "VERIFIED",
  "REJECTED",
  "EXPIRED",
  "REVOKED",
] as const;
export type TenantIdentifierStatus = (typeof tenantIdentifierStatuses)[number];

export interface TenantProfile {
  readonly tenantId: string;
  readonly tradeName: string | null;
  readonly timezone: string;
  readonly primaryLanguage: string;
  readonly supportedLanguages: readonly string[];
  readonly websiteUrl: string | null;
  readonly generalEmail: string | null;
  readonly generalPhone: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TenantAddress {
  readonly id: string;
  readonly tenantId: string;
  readonly addressType: TenantAddressType;
  readonly label: string | null;
  readonly addressLine1: string;
  readonly addressLine2: string | null;
  readonly city: string;
  readonly region: string | null;
  readonly postalCode: string | null;
  readonly countryCode: string;
  readonly isPrimary: boolean;
  readonly status: TenantAddressStatus;
  readonly validFrom: string;
  readonly validTo: string | null;
}

export interface ProtectedTenantIdentifier {
  readonly id: string;
  readonly tenantId: string;
  readonly identifierType: string;
  readonly issuingCountryCode: string;
  /** Encrypted payload only; plaintext must never be persisted. */
  readonly encryptedValue: string;
  /** Key version used to decrypt the encrypted payload. */
  readonly encryptionKeyVersion: string;
  /** HMAC fingerprint used for scoped duplicate detection; never a plain hash. */
  readonly lookupFingerprint: string;
  readonly maskedValue: string;
  readonly status: TenantIdentifierStatus;
  readonly validFrom: string | null;
  readonly validTo: string | null;
}
