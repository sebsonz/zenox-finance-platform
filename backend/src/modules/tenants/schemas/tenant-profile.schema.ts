import { z } from "zod";

const languageTagSchema = z.string().trim().min(2).max(35).regex(
  /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/,
  "Language must be a BCP 47 language tag.",
);

const ianaTimezoneSchema = z.string().trim().min(1).max(80).refine((timezone) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}, "Timezone must be a valid IANA timezone.");

export const updateTenantProfileSchema = z.object({
  tradeName: z.string().trim().max(200).nullable(),
  timezone: ianaTimezoneSchema,
  primaryLanguage: languageTagSchema,
  supportedLanguages: z.array(languageTagSchema).min(1).max(20),
  websiteUrl: z.string().trim().url().max(2048).nullable(),
  generalEmail: z.string().trim().email().max(254).nullable(),
  generalPhone: z.string().trim().max(40).nullable(),
}).strict().superRefine((value, ctx) => {
  if (!value.supportedLanguages.some(
    (language) => language === value.primaryLanguage,
  )) {
    ctx.addIssue({
      code: "custom",
      path: ["supportedLanguages"],
      message: "The primary language must be included in supported languages.",
    });
  }
});

export const createTenantAddressSchema = z.object({
  addressType: z.enum(["REGISTERED", "BUSINESS", "BILLING", "OTHER"]),
  label: z.string().trim().max(100).nullable().optional(),
  addressLine1: z.string().trim().min(1).max(200),
  addressLine2: z.string().trim().max(200).nullable().optional(),
  city: z.string().trim().min(1).max(120),
  region: z.string().trim().max(120).nullable().optional(),
  postalCode: z.string().trim().max(24).nullable().optional(),
  countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/),
  isPrimary: z.boolean().default(false),
  validFrom: z.string().date(),
  validTo: z.string().date().nullable().optional(),
}).strict().superRefine((value, ctx) => {
  if (value.validTo && value.validTo < value.validFrom) {
    ctx.addIssue({
      code: "custom",
      path: ["validTo"],
      message: "validTo must be on or after validFrom.",
    });
  }
});

export const tenantIdentifierSubmissionSchema = z.object({
  identifierType: z.string().trim().min(2).max(60).regex(/^[A-Z][A-Z0-9_.-]*$/),
  issuingCountryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/),
  identifierValue: z.string().trim().min(1).max(160),
  validFrom: z.string().date().nullable().optional(),
  validTo: z.string().date().nullable().optional(),
}).strict().superRefine((value, ctx) => {
  if (value.validFrom && value.validTo && value.validTo < value.validFrom) {
    ctx.addIssue({
      code: "custom",
      path: ["validTo"],
      message: "validTo must be on or after validFrom.",
    });
  }
});

export type UpdateTenantProfileInput = z.infer<typeof updateTenantProfileSchema>;
export type CreateTenantAddressInput = z.infer<typeof createTenantAddressSchema>;
export type TenantIdentifierSubmissionInput = z.infer<typeof tenantIdentifierSubmissionSchema>;
