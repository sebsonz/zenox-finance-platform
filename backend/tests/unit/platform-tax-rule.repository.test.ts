import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/db/pool.js", () => ({
  pool: { query: vi.fn() },
}));
import { pool } from "../../src/db/pool.js";
import { platformTaxRuleRepository } from "../../src/modules/tax/repositories/platform-tax-rule.repository.js";

describe("platformTaxRuleRepository", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a global draft through the installed database function", async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [{ id: "rule-uuid" }], rowCount: 1 } as never);
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
    await expect(platformTaxRuleRepository.createGlobalDraft(input)).resolves.toBe("rule-uuid");
    const [sql, values] = vi.mocked(pool.query).mock.calls[0] ?? [];
    expect(sql).toContain("finance_platform_create_global_tax_rule_draft($1, $2, $3::jsonb, $4, $5)");
    expect(values).toEqual([
      input.actorIssuer,
      input.actorSubject,
      JSON.stringify(input.rule),
      input.reason,
      input.correlationId,
    ]);
  });

  it("fails explicitly when the database function returns no identifier", async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [], rowCount: 0 } as never);
    await expect(platformTaxRuleRepository.createGlobalDraft({
      actorIssuer: "issuer",
      actorSubject: "operator",
      rule: {} as never,
      reason: "Raison de test suffisamment longue",
      correlationId: "corr-1",
    })).rejects.toThrow("GLOBAL_TAX_RULE_DRAFT_CREATION_FAILED");
  });

  it("limits global rules to tenant_id NULL and uses parameterized filters", async () => {
    vi.mocked(pool.query).mockResolvedValue({
      rows: [{ id: "rule-1" }, { id: "rule-2" }],
      rowCount: 2,
    } as never);
    const result = await platformTaxRuleRepository.listGlobal({
      taxType: "VAT", status: "ACTIVE", search: "standard", page: 2, pageSize: 1,
    });
    expect(pool.query).toHaveBeenCalledOnce();
    const [sql, values] = vi.mocked(pool.query).mock.calls[0] ?? [];
    expect(sql).toContain("tenant_id IS NULL");
    expect(sql).toContain("tax_type = $1");
    expect(sql).toContain("status = $2");
    expect(sql).toContain("ILIKE $3");
    expect(sql).toContain("accounting_treatment");
    expect(sql).toContain("applicability_conditions");
    expect(sql).toContain("source_verified_at");
    expect(sql).toContain("reviewed_by");
    expect(values).toEqual(["VAT", "ACTIVE", "%standard%", 2, 1]);
    expect(result.rows).toHaveLength(1);
    expect(result.hasMore).toBe(true);
  });
});
