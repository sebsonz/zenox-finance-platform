import type { PoolClient } from "pg";
import type { TaxTreatment } from "../types/tax.types.js";

export type TaxType =
  | "VAT"
  | "GST"
  | "SALES_TAX"
  | "EXCISE"
  | "WITHHOLDING"
  | "CUSTOMS_DUTY"
  | "IMPORT_TAX"
  | "ENVIRONMENTAL"
  | "STAMP_DUTY"
  | "OTHER";

export interface EffectiveTaxRule {
  readonly id: string;
  readonly tenantId: string | null;
  readonly jurisdictionId: string;
  readonly ruleCode: string;
  readonly name: string;
  readonly taxType: TaxType;
  readonly treatment: TaxTreatment;
  readonly ratePercent: string;
  readonly priceMode: "EXCLUSIVE" | "INCLUSIVE";
  readonly priority: number;
  readonly isCompound: boolean;
  readonly appliesTo: string;
  readonly sourceReference: string | null;
  readonly sourceUrl: string | null;
  readonly version: number;
  readonly validFrom: string;
  readonly validTo: string | null;
  readonly accountingTreatment: string;
  readonly applicabilityConditions: unknown;
}

interface TaxRuleRow {
  id: string;
  tenant_id: string | null;
  jurisdiction_id: string;
  rule_code: string;
  name: string;
  tax_type: TaxType;
  treatment: TaxTreatment;
  rate_percent: string;
  price_mode: "EXCLUSIVE" | "INCLUSIVE";
  priority: number;
  is_compound: boolean;
  applies_to: string;
  source_reference: string | null;
  source_url: string | null;
  version: number;
  valid_from: string;
  valid_to: string | null;
  accounting_treatment: string;
  applicability_conditions: unknown;
}

function mapRow(row: TaxRuleRow): EffectiveTaxRule {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    jurisdictionId: row.jurisdiction_id,
    ruleCode: row.rule_code,
    name: row.name,
    taxType: row.tax_type,
    treatment: row.treatment,
    ratePercent: row.rate_percent,
    priceMode: row.price_mode,
    priority: row.priority,
    isCompound: row.is_compound,
    appliesTo: row.applies_to,
    sourceReference: row.source_reference,
    sourceUrl: row.source_url,
    version: row.version,
    validFrom: row.valid_from,
    validTo: row.valid_to,
    accountingTreatment: row.accounting_treatment,
    applicabilityConditions: row.applicability_conditions,
  };
}

export const taxRuleRepository = {
  /**
   * Call only inside withTenantTransaction so app.tenant_id is transaction-local.
   * A tenant rule shadows the global rule with the same rule_code. A category-specific
   * rule shadows its ALL-category counterpart. Distinct rule codes remain separate taxes.
   */
  async listEffectiveForJurisdiction(
    client: PoolClient,
    jurisdictionId: string,
    appliesTo: string,
    effectiveDate: string,
  ): Promise<EffectiveTaxRule[]> {
    const result = await client.query<TaxRuleRow>(
      `SELECT id, tenant_id, jurisdiction_id, rule_code, name, tax_type,
              treatment, rate_percent::text AS rate_percent, price_mode, priority, is_compound,
              applies_to, source_reference, source_url, version,
              valid_from::text AS valid_from, valid_to::text AS valid_to,
              accounting_treatment, applicability_conditions
         FROM public.finance_tax_rules r
        WHERE jurisdiction_id = $1
          AND status = 'ACTIVE'
          AND applies_to IN ($2, 'ALL')
          AND valid_from <= $3::date
          AND (valid_to IS NULL OR valid_to >= $3::date)
          AND EXISTS (
            SELECT 1 FROM public.finance_tax_jurisdictions j
             WHERE j.id = r.jurisdiction_id AND j.is_active = true
          )
        ORDER BY priority ASC, rule_code ASC, version DESC`,
      [jurisdictionId, appliesTo, effectiveDate],
    );
    return result.rows.map(mapRow);
  },
};
