import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../src/db/pool.js", () => ({ pool: { query: vi.fn() } }));
import { pool } from "../../src/db/pool.js";
import { platformMembershipRepository } from "../../src/modules/platform-admin/repositories/platform-membership.repository.js";

describe("platformMembershipRepository", () => {
  beforeEach(() => vi.clearAllMocks());

  it("checks a specific permission through the database authorization function", async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [{ allowed: true }] } as never);
    await expect(platformMembershipRepository.canManagePermission("issuer", "subject", "PLATFORM_TAX_MANAGE")).resolves.toBe(true);
    expect(pool.query).toHaveBeenCalledWith(
      "SELECT public.finance_platform_actor_can($1, $2, $3) AS allowed",
      ["issuer", "subject", "PLATFORM_TAX_MANAGE"],
    );
  });

  it("returns only memberships supplied by the guarded database function", async () => {
    const rows = [{ identity_issuer: "issuer", identity_subject: "subject", role_code: "PLATFORM_ADMIN", status: "ACTIVE" }];
    vi.mocked(pool.query).mockResolvedValue({ rows } as never);
    await expect(platformMembershipRepository.list("issuer", "subject")).resolves.toEqual(rows);
    expect(pool.query).toHaveBeenCalledWith(
      "SELECT * FROM public.finance_list_platform_members($1, $2)",
      ["issuer", "subject"],
    );
  });

  it("passes audited changes as parameters and never interpolates user values into SQL", async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [{ finance_set_platform_member: true }] } as never);
    await platformMembershipRepository.set({
      actorIssuer: "issuer", actorSubject: "admin", targetIssuer: "issuer", targetSubject: "user",
      roleCode: "PLATFORM_SUPPORT_READONLY", status: "ACTIVE", reason: "Support access approved",
      correlationId: "corr-1",
    });
    expect(pool.query).toHaveBeenCalledWith(
      "SELECT public.finance_set_platform_member($1,$2,$3,$4,$5,$6,$7,$8)",
      ["issuer","admin","issuer","user","PLATFORM_SUPPORT_READONLY","ACTIVE","Support access approved","corr-1"],
    );
  });
});
