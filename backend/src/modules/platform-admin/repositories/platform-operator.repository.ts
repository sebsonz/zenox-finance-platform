import { pool } from "../../../db/pool.js";

/**
 * Platform operator membership is keyed by the verified identity issuer and
 * subject. Email addresses and tenant membership are never authorization keys.
 */
export const platformOperatorRepository = {
  async isActive(identityIssuer: string, identitySubject: string): Promise<boolean> {
    const result = await pool.query<{ is_active: boolean }>(
      "SELECT public.finance_is_active_platform_operator($1, $2) AS is_active",
      [identityIssuer, identitySubject],
    );
    return result.rows[0]?.is_active === true;
  },
};
