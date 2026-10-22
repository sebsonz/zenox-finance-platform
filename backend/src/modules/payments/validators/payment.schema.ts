import { z } from "zod";

const decimalAmount = z.string().regex(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,8})?$/)
  .refine((value) => /[1-9]/.test(value), "Amount must be greater than zero");

export const createPaymentSchema = z.object({
  amount: decimalAmount,
  currencyCode: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  source: z.enum(["MANUAL", "PROVIDER"]),
  method: z.enum(["CASH", "BANK_TRANSFER", "MOBILE_MONEY", "CARD", "OTHER", "PROVIDER"]),
  externalReference: z.string().trim().min(1).max(200).optional(),
  providerCode: z.string().trim().regex(/^[a-z0-9][a-z0-9._-]{1,79}$/).optional(),
  description: z.string().trim().max(1000).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.source === "MANUAL" && value.method === "PROVIDER") {
    ctx.addIssue({ code: "custom", path: ["method"], message: "Manual payments require a manual payment method." });
  }
  if (value.source === "PROVIDER" && (value.method !== "PROVIDER" || !value.providerCode)) {
    ctx.addIssue({ code: "custom", path: ["providerCode"], message: "Provider payments require provider method and providerCode." });
  }
  if (value.source === "MANUAL" && value.providerCode) {
    ctx.addIssue({ code: "custom", path: ["providerCode"], message: "Manual payments cannot specify a provider." });
  }
});

export const listPaymentsQuerySchema = z.object({
  status: z.enum(["PENDING", "CONFIRMED", "SETTLED", "FAILED", "CANCELLED"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().uuid().optional(),
}).strict();

export const allocatePaymentSchema = z.object({
  invoiceId: z.string().uuid(),
  amount: decimalAmount,
}).strict();

export const reverseAllocationSchema = z.object({
  amount: decimalAmount,
  reason: z.string().trim().min(3).max(500),
}).strict();

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type ListPaymentsQuery = z.infer<typeof listPaymentsQuerySchema>;
export type AllocatePaymentInput = z.infer<typeof allocatePaymentSchema>;
export type ReverseAllocationInput = z.infer<typeof reverseAllocationSchema>;
