import { z } from "zod";

const decimalString = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/).max(30);

export const createInvoiceDraftSchema = z.object({
  customerId: z.string().uuid(),
  currencyCode: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  dueDate: z.iso.date().optional(),
  notes: z.string().trim().max(5000).optional(),
  lines: z.array(z.object({
    description: z.string().trim().min(1).max(500),
    quantity: decimalString,
    unitPrice: decimalString,
    discountPercent: decimalString.optional().default("0"),
    taxRatePercent: decimalString,
  }).strict()).min(1).max(500),
}).strict();

export const listInvoiceDraftsQuerySchema = z.object({
  status: z.enum(["DRAFT", "ISSUED", "CANCELLED"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().uuid().optional(),
}).strict();

export type CreateInvoiceDraftInput = z.infer<typeof createInvoiceDraftSchema>;
export type ListInvoiceDraftsQuery = z.infer<typeof listInvoiceDraftsQuerySchema>;
