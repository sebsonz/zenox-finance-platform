import { z } from "zod";

// These limits mirror finance_invoice_lines: quantity/unit_price use
// numeric(24, 8), while discount_percent/tax_rate_percent use numeric(9, 6).
function decimalString(maxIntegerDigits: number, maxScale: number) {
  return z.string()
    .regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/)
    .refine((value) => {
      const [integerPart = "", fractionalPart = ""] = value.split(".");
      return integerPart.length <= maxIntegerDigits && fractionalPart.length <= maxScale;
    }, "Decimal precision exceeds the supported database precision.");
}

const moneyInput = decimalString(16, 8);
const percentageInput = decimalString(3, 6);

export const createInvoiceDraftSchema = z.object({
  customerId: z.string().uuid(),
  currencyCode: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  dueDate: z.iso.date().optional(),
  notes: z.string().trim().max(5000).optional(),
  lines: z.array(z.object({
    description: z.string().trim().min(1).max(500),
    quantity: moneyInput,
    unitPrice: moneyInput,
    discountPercent: percentageInput.optional().default("0"),
    taxRatePercent: percentageInput,
  }).strict()).min(1).max(500),
}).strict();

export const updateInvoiceDraftSchema = createInvoiceDraftSchema.extend({
  expectedUpdatedAt: z.iso.datetime({ offset: true }),
});

export const listInvoiceDraftsQuerySchema = z.object({
  status: z.enum(["DRAFT", "ISSUED", "CANCELLED"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().uuid().optional(),
}).strict();

export type CreateInvoiceDraftInput = z.infer<typeof createInvoiceDraftSchema>;
export type UpdateInvoiceDraftInput = z.infer<typeof updateInvoiceDraftSchema>;
export type ListInvoiceDraftsQuery = z.infer<typeof listInvoiceDraftsQuerySchema>;
