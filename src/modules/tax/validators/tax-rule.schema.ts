import { z } from "zod";

const decimalString = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/);

export const taxTreatmentSchema = z.enum([
  "STANDARD",
  "REDUCED",
  "ZERO_RATED",
  "EXEMPT",
  "REVERSE_CHARGE",
]);

export const taxRuleSchema = z.object({
  code: z.string().trim().min(2).max(40).regex(/^[A-Z0-9][A-Z0-9_-]+$/),
  name: z.string().trim().min(1).max(120),
  countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/),
  treatment: taxTreatmentSchema,
  ratePercent: decimalString,
  validFrom: z.iso.date(),
  validTo: z.iso.date().optional(),
}).strict().superRefine((rule, ctx) => {
  const rate = Number(rule.ratePercent);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
    ctx.addIssue({ code: "custom", path: ["ratePercent"], message: "Tax rate must be between 0 and 100." });
  }
  if (["ZERO_RATED", "EXEMPT", "REVERSE_CHARGE"].includes(rule.treatment) && rate !== 0) {
    ctx.addIssue({
      code: "custom",
      path: ["ratePercent"],
      message: "This treatment requires a zero rate.",
    });
  }
  if (rule.validTo && rule.validTo < rule.validFrom) {
    ctx.addIssue({
      code: "custom",
      path: ["validTo"],
      message: "validTo must be on or after validFrom.",
    });
  }
});

export type TaxRuleInput = z.infer<typeof taxRuleSchema>;
