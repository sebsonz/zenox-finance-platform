import { z } from "zod";

export const calculateAndSnapshotTaxSchema = z.object({
  documentType: z.enum(["INVOICE", "CREDIT_NOTE", "DEBIT_NOTE", "RECEIPT", "OTHER"]),
  documentId: z.string().uuid(),
  documentVersion: z.number().int().positive(),
  taxDate: z.iso.date(),
  currencyCode: z.string().regex(/^[A-Z]{3}$/),
  jurisdictionId: z.string().uuid(),
  appliesTo: z.enum(["GOODS", "SERVICES", "DIGITAL_SERVICES", "FREIGHT", "INSURANCE"]),
  amount: z.string().regex(/^(?:0|[1-9]\d{0,14})(?:\.\d{1,6})?$/),
}).strict();

export type CalculateAndSnapshotTaxInput = z.infer<typeof calculateAndSnapshotTaxSchema>;
