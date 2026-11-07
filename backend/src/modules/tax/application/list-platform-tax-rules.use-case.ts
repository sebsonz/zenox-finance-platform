import { platformTaxRuleRepository, type PlatformTaxRuleQuery } from "../repositories/platform-tax-rule.repository.js";

export const listPlatformTaxRules = {
  async execute(query: PlatformTaxRuleQuery) {
    const result = await platformTaxRuleRepository.listGlobal(query);
    return {
      items: result.rows.map((row) => ({
        id: row.id, jurisdictionId: row.jurisdiction_id, ruleCode: row.rule_code,
        name: row.name, taxType: row.tax_type, treatment: row.treatment,
        ratePercent: row.rate_percent, priceMode: row.price_mode, priority: row.priority,
        isCompound: row.is_compound, appliesTo: row.applies_to,
        sourceReference: row.source_reference, sourceUrl: row.source_url,
        version: row.version, validFrom: row.valid_from, validTo: row.valid_to,
        status: row.status, createdAt: new Date(row.created_at).toISOString(),
        updatedAt: new Date(row.updated_at).toISOString(),
      })),
      page: query.page, pageSize: query.pageSize, hasMore: result.hasMore, scope: "GLOBAL" as const,
    };
  },
};
