import { z } from "zod";

const jsonObjectSchema = z.record(z.string(), z.unknown());

export const createTaxSnapshotSchema = z.object({
  documentType: z.enum(["INVOICE", "CREDIT_NOTE", "DEBIT_NOTE", "RECEIPT", "OTHER"]),
  documentId: z.string().uuid(),
  documentVersion: z.number().int().positive(),
  calculationPolicy: z.string().trim().min(1).max(120),
  engineVersion: z.string().trim().min(1).max(80),
  taxDate: z.iso.date(),
  currencyCode: z.string().regex(/^[A-Z]{3}$/),
  jurisdictionId: z.string().uuid().nullable().optional(),
  inputSnapshot: jsonObjectSchema,
  resultSnapshot: jsonObjectSchema,
  appliedRulesSnapshot: z.array(jsonObjectSchema).max(100),
}).strict();

export type CreateTaxSnapshotInput = z.infer<typeof createTaxSnapshotSchema>;
