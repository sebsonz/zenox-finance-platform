import { pool } from "../../../db/pool.js";
import type { FinanceCurrency } from "../types/currency.js";

interface CurrencyRow {
  code: string;
  name: string;
  minor_unit: number;
  is_active: boolean;
  source: string;
}

function toCurrency(row: CurrencyRow): FinanceCurrency {
  return {
    code: row.code,
    name: row.name,
    minorUnit: row.minor_unit,
    isActive: row.is_active,
    source: row.source,
  };
}

export const currencyRepository = {
  async findActiveByCode(code: string): Promise<FinanceCurrency | null> {
    const result = await pool.query<CurrencyRow>(
      `SELECT code, name, minor_unit, is_active, source
         FROM public.finance_currencies
        WHERE code = $1 AND is_active = true
        LIMIT 1`,
      [code],
    );
    return result.rows[0] ? toCurrency(result.rows[0]) : null;
  },

  async listActive(): Promise<FinanceCurrency[]> {
    const result = await pool.query<CurrencyRow>(
      `SELECT code, name, minor_unit, is_active, source
         FROM public.finance_currencies
        WHERE is_active = true
        ORDER BY code ASC`,
    );
    return result.rows.map(toCurrency);
  },
};
