import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/db/pool.js", () => ({ pool: { query: vi.fn() } }));
import { pool } from "../../src/db/pool.js";
import { platformTaxJurisdictionAdminRepository } from "../../src/modules/tax/repositories/platform-tax-jurisdiction-admin.repository.js";

describe("platformTaxJurisdictionAdminRepository", () => {
  beforeEach(() => vi.clearAllMocks());

  it("upserts a jurisdiction through the installed audited database function", async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [{ id: "jurisdiction-1" }] } as never);
    const input = {
      id: null, code: "BJ", countryCode: "BJ", name: "Bénin", levelCode: "COUNTRY",
      parentId: null, isActive: true, actorIssuer: "issuer", actorSubject: "operator",
      reason: "Création du référentiel du Bénin", correlationId: "corr-1",
    };
    await expect(platformTaxJurisdictionAdminRepository.upsert(input)).resolves.toBe("jurisdiction-1");
    expect(vi.mocked(pool.query).mock.calls[0]?.[0]).toContain("finance_platform_upsert_tax_jurisdiction");
    expect(vi.mocked(pool.query).mock.calls[0]?.[1]).toEqual([
      null, "BJ", "BJ", "Bénin", "COUNTRY", null, true, "issuer", "operator",
      "Création du référentiel du Bénin", "corr-1",
    ]);
  });

  it("upserts a country hierarchy level through the installed audited function", async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [{ id: "level-1" }] } as never);
    await platformTaxJurisdictionAdminRepository.upsertLevel({
      countryCode: "BJ", levelCode: "DEPARTMENT", label: "Département",
      parentLevelCode: "COUNTRY", sortOrder: 10, isRequired: true, isActive: true,
      actorIssuer: "issuer", actorSubject: "operator", reason: "Configuration hiérarchique BJ",
      correlationId: "corr-2",
    });
    expect(vi.mocked(pool.query).mock.calls[0]?.[0]).toContain("finance_platform_upsert_tax_jurisdiction_level");
    expect(vi.mocked(pool.query).mock.calls[0]?.[1]).toEqual([
      "BJ", "DEPARTMENT", "Département", "COUNTRY", 10, true, true,
      "issuer", "operator", "Configuration hiérarchique BJ", "corr-2",
    ]);
  });

  it("reads only the requested country hierarchy", async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [{ level_code: "COUNTRY" }] } as never);
    const rows = await platformTaxJurisdictionAdminRepository.listLevels("BJ");
    expect(rows).toEqual([{ level_code: "COUNTRY" }]);
    expect(vi.mocked(pool.query).mock.calls[0]?.[0]).toContain("WHERE country_code = $1");
    expect(vi.mocked(pool.query).mock.calls[0]?.[1]).toEqual(["BJ"]);
  });

  it("returns only tax administration audit events with bounded pagination", async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [{ id: "event-1" }] } as never);
    const result = await platformTaxJurisdictionAdminRepository.listAuditEvents(1, 25);
    expect(vi.mocked(pool.query).mock.calls[0]?.[0]).toContain("tenant_id IS NULL");
    expect(vi.mocked(pool.query).mock.calls[0]?.[0]).toContain("GLOBAL_TAX_RULE_%");
    expect(vi.mocked(pool.query).mock.calls[0]?.[1]).toEqual([26, 0]);
    expect(result.rows).toHaveLength(1);
    expect(result.hasMore).toBe(false);
  });
});
