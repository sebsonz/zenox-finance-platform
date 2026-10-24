import { z } from "zod";

/**
 * Declarative tax conditions only. Never accept executable expressions, SQL, or
 * arbitrary property paths from a rule administrator.
 */
export const taxConditionFieldSchema = z.enum([
  "transactionType",
  "supplierIfuStatus",
  "customerIfuStatus",
  "customerTaxStatus",
  "customerCountryCode",
  "supplierCountryCode",
  "isImport",
  "isExport",
  "goodsCategory",
]);

const scalarSchema = z.union([z.string().trim().min(1).max(120), z.boolean()]);

export const taxConditionSchema = z.discriminatedUnion("operator", [
  z.object({
    field: taxConditionFieldSchema,
    operator: z.literal("EQ"),
    value: scalarSchema,
  }).strict(),
  z.object({
    field: taxConditionFieldSchema,
    operator: z.literal("IN"),
    value: z.array(scalarSchema).min(1).max(50),
  }).strict(),
]);

export const taxApplicabilityConditionsSchema = z.object({
  schemaVersion: z.literal(1),
  all: z.array(taxConditionSchema).max(30),
}).strict();

export type TaxApplicabilityConditions = z.infer<typeof taxApplicabilityConditionsSchema>;
export type TaxConditionField = z.infer<typeof taxConditionFieldSchema>;

export const taxBusinessFactsSchema = z.object({
  transactionType: z.string().trim().min(1).max(120).optional(),
  supplierIfuStatus: z.enum(["REGISTERED", "NOT_REGISTERED", "UNKNOWN"]).optional(),
  customerIfuStatus: z.enum(["REGISTERED", "NOT_REGISTERED", "UNKNOWN"]).optional(),
  customerTaxStatus: z.string().trim().min(1).max(120).optional(),
  customerCountryCode: z.string().regex(/^[A-Z]{2}$/).optional(),
  supplierCountryCode: z.string().regex(/^[A-Z]{2}$/).optional(),
  isImport: z.boolean().optional(),
  isExport: z.boolean().optional(),
  goodsCategory: z.string().trim().min(1).max(120).optional(),
}).strict();

export type TaxBusinessFacts = z.infer<typeof taxBusinessFactsSchema>;
