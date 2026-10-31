export const registrationStatuses = ["DRAFT", "PENDING", "APPROVED", "REJECTED"] as const;
export type RegistrationStatus = (typeof registrationStatuses)[number];

export const registrationAddressTypes = ["REGISTERED", "BUSINESS", "BILLING"] as const;
export type RegistrationAddressType = (typeof registrationAddressTypes)[number];

export interface RegistrationOrganization {
  readonly legalName: string;
  readonly tradeName: string | null;
  readonly legalForm: string | null;
  readonly countryCode: string;
  readonly defaultCurrency: string;
  readonly registrationNumber: string | null;
}

export interface RegistrationAddress {
  readonly addressType: RegistrationAddressType;
  readonly addressLine1: string;
  readonly addressLine2: string | null;
  readonly city: string;
  readonly region: string | null;
  readonly postalCode: string | null;
  readonly countryCode: string;
}

export interface RegistrationRepresentative {
  readonly fullName: string;
  readonly role: string;
  readonly email: string;
  readonly phone: string | null;
}

export interface RegistrationContact {
  readonly businessEmail: string;
  readonly businessPhone: string | null;
  readonly websiteUrl: string | null;
}

export interface RegistrationPayload {
  readonly organization: RegistrationOrganization;
  readonly address: RegistrationAddress;
  readonly representative: RegistrationRepresentative;
  readonly contact: RegistrationContact;
}

export interface RegistrationDraft {
  readonly id: string;
  readonly payload: RegistrationPayload;
  readonly status: "DRAFT" | "SUBMITTED";
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface RegistrationRequestSummary {
  readonly id: string;
  readonly tenantId: string;
  readonly legalName: string;
  readonly countryCode: string;
  readonly defaultCurrency: string;
  readonly status: Exclude<RegistrationStatus, "DRAFT">;
  readonly submittedAt: string;
  readonly updatedAt: string;
  readonly rejectionReason: string | null;
}
