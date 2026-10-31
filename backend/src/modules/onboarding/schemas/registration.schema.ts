import { z } from "zod";

const countryCode = z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/);
const currencyCode = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/);
const nullableText = (max: number) => z.string().trim().max(max).nullable();
const email = z.string().trim().email().max(254);
const phone = z.string().trim().min(6).max(40).nullable();

export const registrationPayloadSchema = z.object({
  organization: z.object({
    legalName: z.string().trim().min(2).max(200),
    tradeName: nullableText(200).default(null),
    legalForm: nullableText(80).default(null),
    countryCode,
    defaultCurrency: currencyCode,
    registrationNumber: nullableText(100).default(null),
  }).strict(),
  address: z.object({
    addressType: z.enum(["REGISTERED", "BUSINESS", "BILLING"]),
    addressLine1: z.string().trim().min(1).max(200),
    addressLine2: nullableText(200).default(null),
    city: z.string().trim().min(1).max(120),
    region: nullableText(120).default(null),
    postalCode: nullableText(24).default(null),
    countryCode,
  }).strict(),
  representative: z.object({
    fullName: z.string().trim().min(2).max(200),
    role: z.string().trim().min(2).max(100),
    email,
    phone,
  }).strict(),
  contact: z.object({
    businessEmail: email,
    businessPhone: phone,
    websiteUrl: z.string().trim().url().max(2048).nullable().default(null),
  }).strict(),
}).strict();

export const registrationConsentSchema = z.object({
  acceptedTermsVersion: z.string().trim().min(1).max(40),
  acceptedPrivacyVersion: z.string().trim().min(1).max(40),
}).strict();

export type RegistrationPayloadInput = z.infer<typeof registrationPayloadSchema>;
export type RegistrationConsentInput = z.infer<typeof registrationConsentSchema>;
