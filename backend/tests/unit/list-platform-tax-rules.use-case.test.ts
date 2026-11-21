import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/modules/tax/repositories/platform-tax-rule.repository.js", () => ({
  platformTaxRuleRepository: { listGlobal: vi.fn() },
}));
import { platformTaxRuleRepository } from "../../src/modules/tax/repositories/platform-tax-rule.repository.js";
import { listPlatformTaxRules } from "../../src/modules/tax/application/list-platform-tax-rules.use-case.js";

describe("listPlatformTaxRules", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns accounting, applicability and legal review metadata", async () => {
    vi.mocked(platformTaxRuleRepository.listGlobal).mockResolvedValue({
      rows: [{
        id: "rule-1",
        jurisdiction_id: "jurisdiction-1",
        rule_code: "BJ_AIB_1",
        name: "Acompte sur impôt assis sur les bénéfices",
        tax_type: "WITHHOLDING",
        treatment: "WITHHOLDING",
        rate_percent: "1",
        price_mode: "EXCLUSIVE",
        priority: 100,
        is_compound: false,
        applies_to: "SERVICES",
        source_reference: "Code général des impôts",
        source_url: null,
        accounting_treatment: "ADVANCE_INCOME_TAX",
        applicability_conditions: { schemaVersion: 1, all: [] },
        source_verified_at: "2026-01-15",
        reviewed_by: "operator-1",
        version: 1,
        valid_from: "2026-01-01",
        valid_to: null,
        status: "DRAFT",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-02T00:00:00.000Z",
      }],
      hasMore: false,
    } as never);

    const result = await listPlatformTaxRules.execute({ page: 1, pageSize: 25 });

    expect(result.items[0]).toMatchObject({
      accountingTreatment: "ADVANCE_INCOME_TAX",
      applicabilityConditions: { schemaVersion: 1, all: [] },
      sourceVerifiedAt: "2026-01-15",
      reviewedBy: "operator-1",
    });
  });
});
