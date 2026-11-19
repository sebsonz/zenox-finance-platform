import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/db/pool.js", () => ({ pool: { query: vi.fn() } }));
import { pool } from "../../src/db/pool.js";
import { platformTaxDelegationRepository } from "../../src/modules/tax/repositories/platform-tax-delegation.repository.js";

describe("platformTaxDelegationRepository", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists delegations through the operator-checked database function", async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [{ id: "delegation-1" }] } as never);
    const result = await platformTaxDelegationRepository.list("issuer", "operator");
    expect(result).toEqual([{ id: "delegation-1" }]);
    expect(vi.mocked(pool.query).mock.calls[0]?.[0]).toContain("finance_list_platform_tax_delegations($1, $2)");
  });

  it("creates a scoped delegation through the audited database function", async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [{ id: "delegation-1" }] } as never);
    await expect(platformTaxDelegationRepository.create({
      identityIssuer: "https://issuer.example", identitySubject: "agent-1",
      jurisdictionId: null, countryCode: "BJ",
      permissions: ["RULE_REVIEW"], validFrom: "2026-11-19T00:00:00.000Z",
      validTo: null, reason: "Délégation de revue des règles BJ",
      actorIssuer: "https://issuer.example", actorSubject: "operator-1", correlationId: "corr-1",
    })).resolves.toBe("delegation-1");
    expect(vi.mocked(pool.query).mock.calls[0]?.[0]).toContain("finance_create_platform_tax_delegation");
    expect(vi.mocked(pool.query).mock.calls[0]?.[1]).toEqual([
      "https://issuer.example", "agent-1", null, "BJ", ["RULE_REVIEW"],
      "2026-11-19T00:00:00.000Z", null, "Délégation de revue des règles BJ",
      "https://issuer.example", "operator-1", "corr-1",
    ]);
  });

  it("returns the authoritative result of delegation revocation", async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [{ revoked: true }] } as never);
    await expect(platformTaxDelegationRepository.revoke({
      delegationId: "delegation-1", reason: "Fin de la mission de revue",
      actorIssuer: "issuer", actorSubject: "operator", correlationId: "corr-2",
    })).resolves.toBe(true);
    expect(vi.mocked(pool.query).mock.calls[0]?.[0]).toContain("finance_revoke_platform_tax_delegation");
  });
});
