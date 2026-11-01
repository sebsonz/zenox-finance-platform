import { z } from "zod";

const countryCode = z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/);
const currencyCode = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/);
const nullableText = (max: number) => z.string().trim().max(max).nullable();
const email = z.string().trim().email().max(254);
const phone = z.string().trim().min(6).max(40).nullable();

// Drafts are intentionally permissive: the wizard persists all four sections
// after each step, including empty fields belonging to steps not yet visited.
const draftText = (max: number) => z.string().trim().max(max).nullable().optional();
const draftEmail = z.string().trim().max(254).refine((value) => value === "" || z.string().email().safeParse(value).success).optional();
const draftPhone = z.string().trim().max(40).nullable().optional();
const draftCountry = z.string().trim().toUpperCase().refine((value) => value === "" || /^[A-Z]{2}$/.test(value)).optional();
const draftCurrency = z.string().trim().toUpperCase().refine((value) => value === "" || /^[A-Z]{3}$/.test(value)).optional();

export const registrationDraftPayloadSchema = z.object({
  organization: z.object({
    legalName: z.string().trim().max(200).optional(),
    tradeName: draftText(200),
    legalForm: draftText(80),
    countryCode: draftCountry,
    defaultCurrency: draftCurrency,
    registrationNumber: draftText(100),
  }).strict().optional(),
  address: z.object({
    addressType: z.enum(["REGISTERED", "BUSINESS", "BILLING"]).optional(),
    addressLine1: z.string().trim().max(200).optional(),
    addressLine2: draftText(200),
    city: z.string().trim().max(120).optional(),
    region: draftText(120),
    postalCode: draftText(24),
    countryCode: draftCountry,
  }).strict().optional(),
  representative: z.object({
    fullName: z.string().trim().max(200).optional(),
    role: z.string().trim().max(100).optional(),
    email: draftEmail,
    phone: draftPhone,
  }).strict().optional(),
  contact: z.object({
    businessEmail: draftEmail,
    businessPhone: draftPhone,
    websiteUrl: z.string().trim().max(2048).refine((value) => value === "" || z.string().url().safeParse(value).success).nullable().optional(),
  }).strict().optional(),
}).strict();

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

export type RegistrationDraftPayloadInput = z.infer<typeof registrationDraftPayloadSchema>;
export type RegistrationPayloadInput = z.infer<typeof registrationPayloadSchema>;
export type RegistrationConsentInput = z.infer<typeof registrationConsentSchema>;
