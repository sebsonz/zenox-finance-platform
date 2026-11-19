import { pool } from "../../../db/pool.js";

export interface PlatformTaxDelegationInput {
  identityIssuer: string;
  identitySubject: string;
  jurisdictionId: string | null;
  countryCode: string | null;
  permissions: Array<"ASSIGNMENT_REVIEW" | "EVIDENCE_REVIEW" | "RULE_REVIEW" | "JURISDICTION_MANAGE">;
  validFrom: string;
  validTo: string | null;
  reason: string;
  actorIssuer: string;
  actorSubject: string;
  correlationId: string;
}

export const platformTaxDelegationRepository = {
  async list(actorIssuer: string, actorSubject: string) {
    const result = await pool.query(
      "SELECT * FROM public.finance_list_platform_tax_delegations($1, $2)",
      [actorIssuer, actorSubject],
    );
    return result.rows;
  },

  async create(input: PlatformTaxDelegationInput): Promise<string> {
    const result = await pool.query<{ id: string }>(
      "SELECT public.finance_create_platform_tax_delegation($1,$2,$3,$4::char(2),$5::text[],$6::timestamptz,$7::timestamptz,$8,$9,$10,$11) AS id",
      [input.identityIssuer, input.identitySubject, input.jurisdictionId, input.countryCode,
        input.permissions, input.validFrom, input.validTo, input.reason,
        input.actorIssuer, input.actorSubject, input.correlationId],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error("TAX_DELEGATION_CREATION_FAILED");
    return id;
  },

  async revoke(input: {
    delegationId: string; reason: string; actorIssuer: string; actorSubject: string; correlationId: string;
  }): Promise<boolean> {
    const result = await pool.query<{ revoked: boolean }>(
      "SELECT public.finance_revoke_platform_tax_delegation($1,$2,$3,$4,$5) AS revoked",
      [input.delegationId, input.reason, input.actorIssuer, input.actorSubject, input.correlationId],
    );
    return result.rows[0]?.revoked === true;
  },
};
