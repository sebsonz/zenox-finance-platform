import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/db/pool.js", () => ({
  pool: { query: vi.fn() },
}));
import { pool } from "../../src/db/pool.js";
import { platformTaxRuleRepository } from "../../src/modules/tax/repositories/platform-tax-rule.repository.js";

describe("platformTaxRuleRepository", () => {
  beforeEach(() => vi.clearAllMocks());

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
    expect(values).toEqual(["VAT", "ACTIVE", "%standard%", 2, 1]);
    expect(result.rows).toHaveLength(1);
    expect(result.hasMore).toBe(true);
  });
});
