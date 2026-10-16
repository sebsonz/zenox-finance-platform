import type { PoolClient } from "pg";
import type { CreateTaxSnapshotInput } from "../validators/tax-snapshot.schema.js";

export interface TaxCalculationSnapshot {
  readonly id: string;
  readonly tenantId: string;
  readonly documentType: CreateTaxSnapshotInput["documentType"];
  readonly documentId: string;
  readonly documentVersion: number;
  readonly calculationPolicy: string;
  readonly engineVersion: string;
  readonly taxDate: string;
  readonly currencyCode: string;
  readonly currencyMinorUnit: number;
  readonly jurisdictionId: string | null;
  readonly inputSnapshot: Record<string, unknown>;
  readonly resultSnapshot: Record<string, unknown>;
  readonly appliedRulesSnapshot: readonly Record<string, unknown>[];
  readonly createdAt: string;
  readonly createdBy: string;
}

interface SnapshotRow {
  id: string;
  tenant_id: string;
  document_type: CreateTaxSnapshotInput["documentType"];
  document_id: string;
  document_version: number;
  calculation_policy: string;
  engine_version: string;
  tax_date: string;
  currency_code: string;
  currency_minor_unit: number;
  jurisdiction_id: string | null;
  input_snapshot: Record<string, unknown>;
  result_snapshot: Record<string, unknown>;
  applied_rules_snapshot: Record<string, unknown>[];
  created_at: string;
  created_by: string;
}

function mapRow(row: SnapshotRow): TaxCalculationSnapshot {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    documentType: row.document_type,
    documentId: row.document_id,
    documentVersion: row.document_version,
    calculationPolicy: row.calculation_policy,
    engineVersion: row.engine_version,
    taxDate: row.tax_date,
    currencyCode: row.currency_code,
    currencyMinorUnit: row.currency_minor_unit,
    jurisdictionId: row.jurisdiction_id,
    inputSnapshot: row.input_snapshot,
    resultSnapshot: row.result_snapshot,
    appliedRulesSnapshot: row.applied_rules_snapshot,
    createdAt: row.created_at,
    createdBy: row.created_by,
  };
}

const columns = `id, tenant_id, document_type, document_id, document_version,
  calculation_policy, engine_version, tax_date::text AS tax_date,
  currency_code, currency_minor_unit, jurisdiction_id, input_snapshot,
  result_snapshot, applied_rules_snapshot, created_at::text AS created_at,
  created_by`;

export const taxSnapshotRepository = {
  async create(
    client: PoolClient,
    tenantId: string,
    createdBy: string,
    currencyMinorUnit: number,
    input: CreateTaxSnapshotInput,
  ): Promise<TaxCalculationSnapshot> {
    const result = await client.query<SnapshotRow>(
      `INSERT INTO public.finance_tax_calculation_snapshots (
         tenant_id, document_type, document_id, document_version,
         calculation_policy, engine_version, tax_date, currency_code,
         currency_minor_unit, jurisdiction_id, input_snapshot, result_snapshot,
         applied_rules_snapshot, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8, $9, $10, $11::jsonb, $12::jsonb, $13::jsonb, $14)
       RETURNING ${columns}`,
      [
        tenantId, input.documentType, input.documentId, input.documentVersion,
        input.calculationPolicy, input.engineVersion, input.taxDate, input.currencyCode,
        currencyMinorUnit, input.jurisdictionId ?? null,
        JSON.stringify(input.inputSnapshot), JSON.stringify(input.resultSnapshot),
        JSON.stringify(input.appliedRulesSnapshot), createdBy,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("TAX_SNAPSHOT_INSERT_RETURNED_NO_ROW");
    return mapRow(row);
  },

  async findByDocumentVersion(
    client: PoolClient,
    documentType: CreateTaxSnapshotInput["documentType"],
    documentId: string,
    documentVersion: number,
  ): Promise<TaxCalculationSnapshot | null> {
    const result = await client.query<SnapshotRow>(
      `SELECT ${columns}
         FROM public.finance_tax_calculation_snapshots
        WHERE document_type = $1 AND document_id = $2 AND document_version = $3
        LIMIT 1`,
      [documentType, documentId, documentVersion],
    );
    const row = result.rows[0];
    return row ? mapRow(row) : null;
  },
};
