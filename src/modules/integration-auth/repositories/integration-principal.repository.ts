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
      `SELECT id, principal_code, display_name, credential_hash,
              allowed_scopes, allowed_tenant_ids, status
         FROM public.finance_integration_principals
        WHERE principal_code = $1
        LIMIT 1`,
      [principalCode],
    );
    return result.rows[0] ?? null;
  },
};
