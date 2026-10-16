import { z } from "zod";

const decimalString = z.string().regex(/^(?:0|[1-9]\d{0,14})(?:\.\d{1,6})?$/).max(30);

export const calculateInvoiceTaxSnapshotSchema = z.object({
  expectedUpdatedAt: z.iso.datetime({ offset: true }),
  taxDate: z.iso.date(),
  jurisdictionId: z.string().uuid(),
  appliesTo: z.enum(["GOODS", "SERVICES", "DIGITAL_SERVICES", "FREIGHT", "INSURANCE"]),
}).strict();

export type CalculateInvoiceTaxSnapshotInput = z.infer<typeof calculateInvoiceTaxSnapshotSchema>;
