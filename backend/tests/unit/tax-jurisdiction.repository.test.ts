import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock("../../src/db/pool.js", () => ({
  pool: { query: mocks.query },
}));

import { taxJurisdictionRepository } from "../../src/modules/tax/repositories/tax-jurisdiction.repository.js";

describe("taxJurisdictionRepository", () => {
  afterEach(() => vi.clearAllMocks());

  it("uses parameterized filters, a stable order and bounded pagination", async () => {
    const rows = Array.from({ length: 3 }, (_, index) => ({
      id: `00000000-0000-4000-8000-00000000000${index + 1}`,
      code: `BJ_TEST_${index}`,
      country_code: "BJ",
      name: `Jurisdiction ${index}`,
      jurisdiction_level: "COUNTRY" as const,
      parent_id: null,
      is_active: true,
      created_at: new Date("2026-10-30T00:00:00.000Z"),
      updated_at: new Date("2026-10-30T00:00:00.000Z"),
    }));
    mocks.query.mockResolvedValue({ rows });

    const result = await taxJurisdictionRepository.listActive({
      countryCode: "BJ",
      level: "COUNTRY",
      page: 2,
      pageSize: 2,
    });

    const [sql, values] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("is_active = true");
    expect(sql).toContain("country_code = $1");
    expect(sql).toContain("jurisdiction_level = $2");
    expect(sql).toContain("ORDER BY country_code ASC, jurisdiction_level ASC, name ASC, code ASC, id ASC");
    expect(sql).toContain("LIMIT $3 OFFSET $4");
    expect(values).toEqual(["BJ", "COUNTRY", 3, 2]);
    expect(result).toMatchObject({
      page: 2,
      pageSize: 2,
      hasMore: true,
      items: rows.slice(0, 2),
    });
  });

  it("returns an empty page without claiming more results", async () => {
    mocks.query.mockResolvedValue({ rows: [] });
    const result = await taxJurisdictionRepository.listActive({
      page: 1,
      pageSize: 25,
    });
    expect(result).toMatchObject({ items: [], page: 1, pageSize: 25, hasMore: false });
  });
});
