import { z } from "zod";

export const calculateInvoiceTaxSnapshotSchema = z.object({
  expectedUpdatedAt: z.iso.datetime({ offset: true }),
  taxDate: z.iso.date(),
  jurisdictionId: z.string().uuid(),
  appliesTo: z.enum(["GOODS", "SERVICES", "DIGITAL_SERVICES", "FREIGHT", "INSURANCE"]),
}).strict();

export type CalculateInvoiceTaxSnapshotInput = z.infer<typeof calculateInvoiceTaxSnapshotSchema>;
