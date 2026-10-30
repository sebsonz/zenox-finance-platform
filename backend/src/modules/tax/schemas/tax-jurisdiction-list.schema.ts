import { z } from "zod";

export const taxJurisdictionLevelSchema = z.enum([
  "COUNTRY",
  "STATE",
  "PROVINCE",
  "REGION",
  "CITY",
  "SPECIAL_ZONE",
]);

export const taxJurisdictionListQuerySchema = z.object({
  countryCode: z.string().regex(/^[A-Z]{2}$/).optional(),
  level: taxJurisdictionLevelSchema.optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
}).strict();

export type TaxJurisdictionListQuery = z.infer<typeof taxJurisdictionListQuerySchema>;
