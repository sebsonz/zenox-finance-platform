import { z } from "zod";

const decimalAmount = z.string()
  .regex(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,8})?$/)
  .refine((value) => /[1-9]/.test(value), "Amount must be greater than zero");

const providerCode = z.string().trim().regex(/^[a-z0-9][a-z0-9._-]{1,79}$/);
const externalReference = z.string().trim().min(1).max(200);
const currencyCode = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/);

export const reconciliationImportRowSchema = z.object({
  providerCode,
  externalReference,
  amount: decimalAmount,
  currencyCode,
  transactionDate: z.string().datetime({ offset: true }).optional(),
  safeMetadata: z.record(z.unknown()).optional(),
}).strict();

export const reconciliationImportSchema = z.object({
  rows: z.array(reconciliationImportRowSchema).min(1).max(500),
}).strict().superRefine(({ rows }, ctx) => {
  const seen = new Set<string>();
  rows.forEach((row, index) => {
    const key = `${row.providerCode}\u0000${row.externalReference}`;
    if (seen.has(key)) {
      ctx.addIssue({
        code: "custom",
        path: ["rows", index, "externalReference"],
        message: "A provider/external reference pair may appear only once per import batch.",
      });
    }
    seen.add(key);
  });
});

export const reconciliationListQuerySchema = z.object({
  status: z.enum(["UNMATCHED", "MATCHED", "CONFLICT", "IGNORED"]).optional(),
  providerCode: providerCode.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().uuid().optional(),
}).strict();

export const reconciliationMatchSchema = z.object({
  paymentId: z.string().uuid().optional(),
}).strict();

export type ReconciliationImportRow = z.infer<typeof reconciliationImportRowSchema>;
export type ReconciliationImportInput = z.infer<typeof reconciliationImportSchema>;
export type ReconciliationListQuery = z.infer<typeof reconciliationListQuerySchema>;
export type ReconciliationMatchInput = z.infer<typeof reconciliationMatchSchema>;
