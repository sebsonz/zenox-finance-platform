import { pool } from "../../../db/pool.js";

export interface FinanceUserTenantDirectoryEntry {
  id: string;
  tenant_code: string;
  legal_name: string;
  role_code: "OWNER" | "ADMIN" | "FINANCE_MANAGER" | "FINANCE_OPERATOR" | "VIEWER";
}

export const userTenantDirectoryRepository = {
  async listActiveTenantsForIdentity(
    identityIssuer: string,
    identitySubject: string,
  ): Promise<FinanceUserTenantDirectoryEntry[]> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "SELECT set_config('app.identity_issuer', $1, true), set_config('app.identity_subject', $2, true)",
        [identityIssuer, identitySubject],
      );
      const result = await client.query<FinanceUserTenantDirectoryEntry>(
        "SELECT id, tenant_code, legal_name, role_code FROM public.finance_list_my_active_tenants()",
      );
      await client.query("COMMIT");
      return result.rows;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Preserve the original query error.
      }
      throw error;
    } finally {
      client.release();
    }
  },
};
