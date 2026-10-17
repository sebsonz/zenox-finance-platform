import { pool } from "../../../db/pool.js";

export interface IntegrationPrincipalRecord {
  id: string;
  principal_code: string;
  display_name: string;
  credential_hash: string;
  allowed_scopes: string[];
  allowed_tenant_ids: string[];
  status: "ACTIVE" | "REVOKED";
}

export const integrationPrincipalRepository = {
  async findByCode(principalCode: string): Promise<IntegrationPrincipalRecord | null> {
    const result = await pool.query<IntegrationPrincipalRecord>(
      `SELECT p.id,
              p.principal_code,
              p.display_name,
              p.credential_hash,
              p.allowed_scopes,
              COALESCE(
                array_agg(g.tenant_id) FILTER (WHERE g.tenant_id IS NOT NULL),
                ARRAY[]::uuid[]
              ) AS allowed_tenant_ids,
              p.status
         FROM public.finance_integration_principals AS p
         LEFT JOIN public.finance_integration_tenant_grants AS g
           ON g.principal_id = p.id
        WHERE p.principal_code = $1
        GROUP BY p.id, p.principal_code, p.display_name, p.credential_hash,
                 p.allowed_scopes, p.status
        LIMIT 1`,
      [principalCode],
    );
    return result.rows[0] ?? null;
  },
};
