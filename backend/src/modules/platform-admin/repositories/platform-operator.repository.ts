import { pool } from "../../../db/pool.js";

export const platformOperatorRepository = {
  async isActive(identityIssuer: string, identitySubject: string): Promise<boolean> {
    const result = await pool.query<{ is_active: boolean }>(
      "SELECT public.finance_is_active_platform_operator($1, $2) AS is_active",
      [identityIssuer, identitySubject],
    );
    return result.rows[0]?.is_active === true;
  },
};
