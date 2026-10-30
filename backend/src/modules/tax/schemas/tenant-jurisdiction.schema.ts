import { z } from "zod";

export const createTenantJurisdictionAssignmentSchema = z.object({
  jurisdictionId: z.string().uuid(),
  validFrom: z.string().date(),
  validTo: z.string().date().nullable().optional(),
  basisType: z.string().trim().min(2).max(60).regex(/^[A-Z][A-Z0-9_.-]*$/),
  basisReference: z.string().trim().max(200).nullable().optional(),
  evidenceDocumentId: z.string().uuid().nullable().optional(),
}).strict().superRefine((value, ctx) => {
  if (value.validTo && value.validTo < value.validFrom) {
    ctx.addIssue({
      code: "custom",
      path: ["validTo"],
      message: "validTo must be on or after validFrom.",
    });
  }
});

export const reviewTenantJurisdictionAssignmentSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  reason: z.string().trim().min(10).max(1000).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.decision === "REJECT" && !value.reason) {
    ctx.addIssue({
      code: "custom",
      path: ["reason"],
      message: "A reason is required when rejecting an assignment.",
    });
  }
});

export type CreateTenantJurisdictionAssignmentInput =
  z.infer<typeof createTenantJurisdictionAssignmentSchema>;
export type ReviewTenantJurisdictionAssignmentInput =
  z.infer<typeof reviewTenantJurisdictionAssignmentSchema>;
