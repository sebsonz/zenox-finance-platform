import { z } from "zod";

const refundAmount = z.string().regex(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,8})?$/)
  .refine((value) => /[1-9]/.test(value), "Amount must be greater than zero");

export const createRefundSchema = z.object({
  amount: refundAmount,
  reason: z.string().trim().min(3).max(500),
}).strict();

export const recordManualRefundSuccessSchema = z.object({
  externalReference: z.string().trim().min(1).max(200).optional(),
}).strict();

export type CreateRefundInput = z.infer<typeof createRefundSchema>;
export type RecordManualRefundSuccessInput = z.infer<typeof recordManualRefundSuccessSchema>;
