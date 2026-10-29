import { z } from "zod";

const optionalTrimmed = (max: number) =>
  z.string().trim().max(max).optional().transform((value) => value || undefined);

export const customerTypeSchema = z.enum(["BUSINESS", "INDIVIDUAL"]);

export const createCustomerSchema = z.object({
  customerCode: z.string().trim().min(2).max(60).regex(/^[A-Z0-9][A-Z0-9_-]+$/),
  customerType: customerTypeSchema,
  legalName: z.string().trim().min(1).max(200),
  displayName: optionalTrimmed(200),
  email: z.string().trim().email().max(254).optional(),
  phone: optionalTrimmed(40),
  countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/),
  taxIdentifier: optionalTrimmed(100),
  registrationIdentifier: optionalTrimmed(100),
  defaultCurrency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional(),
  externalSystem: optionalTrimmed(80),
  externalCustomerId: optionalTrimmed(160),
  metadata: z.record(z.string(), z.unknown()).default({}),
}).strict().superRefine((value, ctx) => {
  if ((value.externalSystem === undefined) !== (value.externalCustomerId === undefined)) {
    ctx.addIssue({
      code: "custom",
      path: ["externalCustomerId"],
      message: "externalSystem and externalCustomerId must be supplied together.",
    });
  }
});

export const updateCustomerSchema = z.object({
  legalName: z.string().trim().min(1).max(200).optional(),
  displayName: z.string().trim().max(200).nullable().optional(),
  email: z.string().trim().email().max(254).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).optional(),
  taxIdentifier: z.string().trim().max(100).nullable().optional(),
  registrationIdentifier: z.string().trim().max(100).nullable().optional(),
  defaultCurrency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).nullable().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: "At least one customer field must be provided.",
});

export const listCustomersQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional().default("ACTIVE"),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().uuid().optional(),
}).strict();

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;
