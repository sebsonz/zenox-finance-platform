import { z } from "zod";

export const createTenantExternalReferenceSchema = z.object({
  externalSystemCode: z.string().trim().min(2).max(80).toUpperCase()
    .regex(/^[A-Z][A-Z0-9_.-]*$/),
  externalCompanyId: z.string().trim().min(1).max(160),
}).strict();

export const resolveTenantExternalReferenceSchema = createTenantExternalReferenceSchema;

export type CreateTenantExternalReferenceInput =
  z.infer<typeof createTenantExternalReferenceSchema>;
export type ResolveTenantExternalReferenceInput =
  z.infer<typeof resolveTenantExternalReferenceSchema>;
