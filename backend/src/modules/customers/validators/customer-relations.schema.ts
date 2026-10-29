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

export const listCustomerRelationsQuerySchema = z.object({
  status: z.enum(["ACTIVE", "ARCHIVED"]).default("ACTIVE"),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().uuid().optional(),
}).strict();

export type CreateCustomerContactInput = z.infer<typeof createCustomerContactSchema>;
export type CreateCustomerAddressInput = z.infer<typeof createCustomerAddressSchema>;
export type ListCustomerRelationsQuery = z.infer<typeof listCustomerRelationsQuerySchema>;
