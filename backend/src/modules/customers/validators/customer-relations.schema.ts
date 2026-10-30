import { z } from "zod";

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().transform((value) => value || undefined);

export const createCustomerContactSchema = z.object({
  contactType: z.enum(["GENERAL", "BILLING", "TECHNICAL", "LEGAL", "OTHER"]).default("GENERAL"),
  fullName: z.string().trim().min(1).max(200),
  jobTitle: optionalText(120),
  email: z.string().trim().email().max(254).optional(),
  phone: optionalText(40),
  isPrimary: z.boolean().default(false),
}).strict();

export const updateCustomerContactSchema = z.object({
  contactType: z.enum(["GENERAL", "BILLING", "TECHNICAL", "LEGAL", "OTHER"]).optional(),
  fullName: z.string().trim().min(1).max(200).optional(),
  jobTitle: z.string().trim().max(120).nullable().optional(),
  email: z.string().trim().email().max(254).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  isPrimary: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, { message: "At least one contact field must be provided." });

export const createCustomerAddressSchema = z.object({
  addressType: z.enum(["REGISTERED", "BILLING", "SHIPPING", "OTHER"]),
  label: optionalText(100),
  recipientName: optionalText(200),
  addressLine1: z.string().trim().min(1).max(200),
  addressLine2: optionalText(200),
  city: z.string().trim().min(1).max(120),
  region: optionalText(120),
  postalCode: optionalText(24),
  countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/),
  isPrimary: z.boolean().default(false),
}).strict();

export const updateCustomerAddressSchema = z.object({
  addressType: z.enum(["REGISTERED", "BILLING", "SHIPPING", "OTHER"]).optional(),
  label: z.string().trim().max(100).nullable().optional(),
  recipientName: z.string().trim().max(200).nullable().optional(),
  addressLine1: z.string().trim().min(1).max(200).optional(),
  addressLine2: z.string().trim().max(200).nullable().optional(),
  city: z.string().trim().min(1).max(120).optional(),
  region: z.string().trim().max(120).nullable().optional(),
  postalCode: z.string().trim().max(24).nullable().optional(),
  countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).optional(),
  isPrimary: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, { message: "At least one address field must be provided." });

export const listCustomerRelationsQuerySchema = z.object({
  status: z.enum(["ACTIVE", "ARCHIVED"]).default("ACTIVE"),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().uuid().optional(),
}).strict();

export type CreateCustomerContactInput = z.infer<typeof createCustomerContactSchema>;
export type UpdateCustomerContactInput = z.infer<typeof updateCustomerContactSchema>;
export type CreateCustomerAddressInput = z.infer<typeof createCustomerAddressSchema>;
export type UpdateCustomerAddressInput = z.infer<typeof updateCustomerAddressSchema>;
export type ListCustomerRelationsQuery = z.infer<typeof listCustomerRelationsQuerySchema>;
