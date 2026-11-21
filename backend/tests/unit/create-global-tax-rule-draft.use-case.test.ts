import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/modules/tax/repositories/platform-tax-rule.repository.js", () => ({
  platformTaxRuleRepository: { createGlobalDraft: vi.fn() },
}));
import { platformTaxRuleRepository } from "../../src/modules/tax/repositories/platform-tax-rule.repository.js";
import { createGlobalTaxRuleDraft } from "../../src/modules/tax/application/create-global-tax-rule-draft.use-case.js";

describe("createGlobalTaxRuleDraft", () => {
  beforeEach(() => vi.clearAllMocks());

  it("delegates validated global draft data to the repository", async () => {
    const input = {
      actorIssuer: "https://issuer.example",
      actorSubject: "operator-1",
      rule: {
        jurisdictionId: "7c58f5f7-2dca-4ed1-a0db-8cc7d77f5c41",
        ruleCode: "BJ_VAT_18",
        name: "TVA standard",
        taxType: "VAT" as const,
        treatment: "STANDARD" as const,
        ratePercent: "18",
        priceMode: "EXCLUSIVE" as const,
        priority: 100,
        isCompound: false,
        appliesTo: "GOODS" as const,
        sourceReference: "Code général des impôts du Bénin",
        validFrom: "2026-01-01",
        accountingTreatment: "TAX_CHARGED" as const,
        applicabilityConditions: { schemaVersion: 1 as const, all: [] },
      },
      reason: "Création de la règle fiscale initiale",
      correlationId: "corr-2026-001",
    };
    vi.mocked(platformTaxRuleRepository.createGlobalDraft).mockResolvedValue("rule-uuid");
    await expect(createGlobalTaxRuleDraft.execute(input)).resolves.toBe("rule-uuid");
    expect(platformTaxRuleRepository.createGlobalDraft).toHaveBeenCalledWith(input);
  });
});
