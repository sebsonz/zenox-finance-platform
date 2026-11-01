import { z } from "zod";
import { taxBusinessFactsSchema } from "../../tax/validators/tax-applicability.schema.js";

export const calculateInvoiceTaxSnapshotSchema = z.object({
  expectedUpdatedAt: z.iso.datetime({ offset: true }),
  taxDate: z.iso.date(),
  jurisdictionId: z.string().uuid(),
  appliesTo: z.enum(["GOODS", "SERVICES", "DIGITAL_SERVICES", "FREIGHT", "INSURANCE"]),
  taxFacts: taxBusinessFactsSchema.optional(),
}).strict();

export type CalculateInvoiceTaxSnapshotInput = z.infer<typeof calculateInvoiceTaxSnapshotSchema>;
