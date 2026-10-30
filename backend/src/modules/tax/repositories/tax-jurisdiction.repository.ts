import { pool } from "../../../db/pool.js";
import type { TaxJurisdictionListQuery } from "../schemas/tax-jurisdiction-list.schema.js";

export interface TaxJurisdictionRecord {
  id: string;
  code: string;
  country_code: string;
  name: string;
  jurisdiction_level: "COUNTRY" | "STATE" | "PROVINCE" | "REGION" | "CITY" | "SPECIAL_ZONE";
  parent_id: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface TaxJurisdictionPage {
  readonly items: TaxJurisdictionRecord[];
  readonly page: number;
  readonly pageSize: number;
  readonly hasMore: boolean;
}

export const taxJurisdictionRepository = {
  async listActive(query: TaxJurisdictionListQuery): Promise<TaxJurisdictionPage> {
    const values: (string | number)[] = [];
    const conditions = ["is_active = true"];

    if (query.countryCode) {
      values.push(query.countryCode);
      conditions.push(`country_code = $${values.length}`);
    }
    if (query.level) {
      values.push(query.level);
      conditions.push(`jurisdiction_level = $${values.length}`);
    }

    const offset = (query.page - 1) * query.pageSize;
    values.push(query.pageSize + 1);
    const limitParameter = values.length;
    values.push(offset);
    const offsetParameter = values.length;

    const result = await pool.query<TaxJurisdictionRecord>(
      `SELECT id, code, country_code, name, jurisdiction_level, parent_id,
              is_active, created_at, updated_at
         FROM public.finance_tax_jurisdictions
        WHERE ${conditions.join(" AND ")}
        ORDER BY country_code ASC, jurisdiction_level ASC, name ASC, code ASC, id ASC
        LIMIT $${limitParameter} OFFSET $${offsetParameter}`,
      values,
    );

    const hasMore = result.rows.length > query.pageSize;
    const items = hasMore ? result.rows.slice(0, query.pageSize) : result.rows;
    return {
      items,
      page: query.page,
      pageSize: query.pageSize,
      hasMore,
    };
  },
};
