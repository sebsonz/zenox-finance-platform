import { z } from "zod";
import { taxTreatmentSchema } from "../types/tax.types.js";

const decimalString = z.string().regex(/^(?:0|[1-9]\d{0,2})(?:\.\d{1,6})?$/);
const taxTreatmentValidator = z.enum(taxTreatmentSchema);
const taxTypeSchema = z.enum([
  "VAT", "GST", "SALES_TAX", "EXCISE", "WITHHOLDING",
  "CUSTOMS_DUTY", "IMPORT_TAX", "ENVIRONMENTAL", "STAMP_DUTY", "OTHER",
]);
const appliesToSchema = z.enum([
  "GOODS", "SERVICES", "DIGITAL_SERVICES", "FREIGHT", "INSURANCE", "ALL",
]);

export const taxRuleSchema = z.object({
  tenantId: z.string().uuid().optional(),
  jurisdictionId: z.string().uuid(),
  ruleCode: z.string().trim().min(2).max(80).regex(/^[A-Z0-9][A-Z0-9_.:-]+$/),
  name: z.string().trim().min(1).max(160),
  taxType: taxTypeSchema,
  treatment: taxTreatmentValidator,
  ratePercent: decimalString,
  priceMode: z.enum(["EXCLUSIVE", "INCLUSIVE"]).default("EXCLUSIVE"),
  priority: z.number().int().min(0).max(10000).default(100),
  isCompound: z.boolean().default(false),
  appliesTo: appliesToSchema.default("GOODS"),
  sourceReference: z.string().trim().max(500).optional(),
  sourceUrl: z.url().max(2000).optional(),
  version: z.number().int().positive().default(1),
  validFrom: z.iso.date(),
  validTo: z.iso.date().optional(),
  status: z.enum(["DRAFT", "ACTIVE", "RETIRED"]).default("DRAFT"),
}).strict().superRefine((rule, ctx) => {
  const rate = Number(rule.ratePercent);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
    ctx.addIssue({ code: "custom", path: ["ratePercent"], message: "Tax rate must be between 0 and 100." });
  }
  if (["ZERO_RATED", "EXEMPT", "REVERSE_CHARGE"].includes(rule.treatment) && rate !== 0) {
    ctx.addIssue({ code: "custom", path: ["ratePercent"], message: "This treatment requires a zero rate." });
  }
  if ((rule.treatment === "WITHHOLDING") !== (rule.taxType === "WITHHOLDING")) {
    ctx.addIssue({
      code: "custom",
      path: ["taxType"],
      message: "WITHHOLDING treatment and tax type must be used together.",
    });
  }
  if (rule.validTo && rule.validTo < rule.validFrom) {
    ctx.addIssue({ code: "custom", path: ["validTo"], message: "validTo must be on or after validFrom." });
  }
});

export type TaxRuleInput = z.infer<typeof taxRuleSchema>;
