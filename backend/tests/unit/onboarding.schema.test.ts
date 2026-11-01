import { describe, expect, it } from "vitest";
import { registrationConsentSchema, registrationPayloadSchema } from "../../src/modules/onboarding/schemas/registration.schema.js";
import { assertRegistrationTransition, canTransitionRegistration } from "../../src/modules/onboarding/domain/registration-transition.js";

const validPayload = {
  organization: {
    legalName: "Example Finance SARL",
    tradeName: null,
    legalForm: "SARL",
    countryCode: "bj",
    defaultCurrency: "xof",
    registrationNumber: null,
  },
  address: {
    addressType: "REGISTERED",
    addressLine1: "Rue du Port",
    addressLine2: null,
    city: "Cotonou",
    region: "Littoral",
    postalCode: null,
    countryCode: "BJ",
  },
  representative: {
    fullName: "Example Owner",
    role: "Gérant",
    email: "owner@example.test",
    phone: null,
  },
  contact: {
    businessEmail: "contact@example.test",
    businessPhone: null,
    websiteUrl: null,
  },
};

describe("M02 onboarding schemas", () => {
  it("normalizes country and currency codes and accepts a complete registration payload", () => {
    const result = registrationPayloadSchema.parse(validPayload);
    expect(result.organization.countryCode).toBe("BJ");
    expect(result.organization.defaultCurrency).toBe("XOF");
  });

  it("rejects unexpected identity and authorization fields", () => {
    expect(registrationPayloadSchema.safeParse({
      ...validPayload,
      identitySubject: "attacker-controlled",
      role: "OWNER",
    }).success).toBe(false);
  });

  it("requires separate terms and privacy versions", () => {
    expect(registrationConsentSchema.safeParse({
      acceptedTermsVersion: "terms-v1",
      acceptedPrivacyVersion: "privacy-v1",
    }).success).toBe(true);
    expect(registrationConsentSchema.safeParse({
      acceptedTermsVersion: "terms-v1",
    }).success).toBe(false);
  });

  it("allows only draft submission and terminal decisions", () => {
    expect(canTransitionRegistration("DRAFT", "PENDING")).toBe(true);
    expect(canTransitionRegistration("PENDING", "APPROVED")).toBe(true);
    expect(canTransitionRegistration("APPROVED", "REJECTED")).toBe(false);
    expect(() => assertRegistrationTransition("REJECTED", "PENDING")).toThrow("INVALID_REGISTRATION_STATUS_TRANSITION");
  });
});
