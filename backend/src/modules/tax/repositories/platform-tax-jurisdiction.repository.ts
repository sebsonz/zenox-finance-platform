import { pool } from "../../../db/pool.js";

export interface PlatformTaxJurisdiction {
  readonly id: string;
  readonly code: string;
  readonly countryCode: string;
  readonly name: string;
  readonly jurisdictionLevel: string;
  readonly parentId: string | null;
  readonly isActive: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface PlatformTaxJurisdictionRow {
  id: string;
  code: string;
  country_code: string;
  name: string;
  jurisdiction_level: string;
  parent_id: string | null;
  is_active: boolean;
  created_at: Date | string;
  updated_at: Date | string;
}

export const platformTaxJurisdictionRepository = {
  async listForOperator(identityIssuer: string, identitySubject: string): Promise<PlatformTaxJurisdiction[]> {
    const result = await pool.query<PlatformTaxJurisdictionRow>(
      `SELECT id, code, country_code, name, jurisdiction_level, parent_id,
              is_active, created_at, updated_at
         FROM public.finance_list_platform_tax_jurisdictions($1, $2)`,
      [identityIssuer, identitySubject],
    );

    return result.rows.map((row) => ({
      id: row.id,
      code: row.code,
      countryCode: row.country_code,
      name: row.name,
      jurisdictionLevel: row.jurisdiction_level,
      parentId: row.parent_id,
      isActive: row.is_active,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    }));
  },
};
