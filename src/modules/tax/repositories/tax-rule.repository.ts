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
      `WITH eligible_rules AS (
         SELECT id, tenant_id, jurisdiction_id, rule_code, name, tax_type,
                treatment, rate_percent::text AS rate_percent, price_mode, priority, is_compound,
                applies_to, source_reference, source_url, version,
                valid_from::text AS valid_from, valid_to::text AS valid_to,
                ROW_NUMBER() OVER (
                  PARTITION BY rule_code
                  ORDER BY (applies_to = $2) DESC,
                           (tenant_id IS NULL) ASC,
                           version DESC,
                           priority ASC
                ) AS override_rank
           FROM public.finance_tax_rules r
          WHERE jurisdiction_id = $1
            AND status = 'ACTIVE'
            AND applies_to IN ($2, 'ALL')
            AND valid_from <= $3::date
            AND (valid_to IS NULL OR valid_to >= $3::date)
            AND EXISTS (
              SELECT 1 FROM public.finance_tax_jurisdictions j
               WHERE j.id = finance_tax_rules.jurisdiction_id AND j.is_active = true
            )
       )
       SELECT id, tenant_id, jurisdiction_id, rule_code, name, tax_type,
              treatment, rate_percent, price_mode, priority, is_compound,
              applies_to, source_reference, source_url, version, valid_from, valid_to
         FROM eligible_rules
        WHERE override_rank = 1
        ORDER BY priority ASC, rule_code ASC`,
      [jurisdictionId, appliesTo, effectiveDate],
    );
    return result.rows.map(mapRow);
  },
};
