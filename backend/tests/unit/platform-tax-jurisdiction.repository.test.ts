import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/db/pool.js", () => ({
  pool: { query: vi.fn() },
}));
import { pool } from "../../src/db/pool.js";
import { platformTaxJurisdictionRepository } from "../../src/modules/tax/repositories/platform-tax-jurisdiction.repository.js";

describe("platformTaxJurisdictionRepository", () => {
  beforeEach(() => vi.clearAllMocks());

  it("delegates global jurisdiction access to the operator-checked SQL function", async () => {
    vi.mocked(pool.query).mockResolvedValue({
      rows: [{
        id: "jurisdiction-1",
        code: "BJ",
        country_code: "BJ",
        name: "Bénin",
        jurisdiction_level: "COUNTRY",
        parent_id: null,
        is_active: true,
        created_at: new Date("2026-11-07T10:00:00.000Z"),
        updated_at: new Date("2026-11-07T10:00:00.000Z"),
      }],
      rowCount: 1,
    } as never);

    const result = await platformTaxJurisdictionRepository.listForOperator("issuer", "subject");

    expect(pool.query).toHaveBeenCalledOnce();
    const [sql, values] = vi.mocked(pool.query).mock.calls[0] ?? [];
    expect(sql).toContain("finance_list_platform_tax_jurisdictions($1, $2)");
    expect(sql).not.toContain("FROM public.finance_tax_jurisdictions");
    expect(values).toEqual(["issuer", "subject"]);
    expect(result).toEqual([{
      id: "jurisdiction-1",
      code: "BJ",
      countryCode: "BJ",
      name: "Bénin",
      jurisdictionLevel: "COUNTRY",
      parentId: null,
      isActive: true,
      createdAt: "2026-11-07T10:00:00.000Z",
      updatedAt: "2026-11-07T10:00:00.000Z",
    }]);
  });
});
