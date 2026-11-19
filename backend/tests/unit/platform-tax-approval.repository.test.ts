import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/db/pool.js", () => ({ pool: { query: vi.fn() } }));
import { pool } from "../../src/db/pool.js";
import { platformTaxApprovalRepository } from "../../src/modules/tax/repositories/platform-tax-approval.repository.js";

describe("platformTaxApprovalRepository", () => {
  beforeEach(() => vi.clearAllMocks());

  it("submits a global draft using the installed database workflow function", async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [{ approval_id: "approval-1" }] } as never);
    await expect(platformTaxApprovalRepository.submit("rule-1", "issuer", "operator", "corr-1")).resolves.toBe("approval-1");
    expect(vi.mocked(pool.query).mock.calls[0]?.[0]).toContain("finance_submit_global_tax_rule_for_approval($1, $2, $3, $4)");
    expect(vi.mocked(pool.query).mock.calls[0]?.[1]).toEqual(["rule-1", "issuer", "operator", "corr-1"]);
  });

  it("reviews through the installed database function and returns its authoritative status", async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [{ approval_id: "approval-1", rule_id: "rule-1", status: "APPROVED" }] } as never);
    const result = await platformTaxApprovalRepository.review({
      approvalId: "approval-1", decision: "APPROVE", reason: "",
      actorIssuer: "issuer", actorSubject: "reviewer", correlationId: "corr-2",
    });
    expect(result.status).toBe("APPROVED");
    expect(vi.mocked(pool.query).mock.calls[0]?.[0]).toContain("finance_review_global_tax_rule($1, $2, $3, $4, $5, $6)");
    expect(vi.mocked(pool.query).mock.calls[0]?.[1]).toEqual(["approval-1", "APPROVE", "", "issuer", "reviewer", "corr-2"]);
  });

  it("lists only global approvals and binds filters and pagination", async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [{ approval_id: "approval-1" }, { approval_id: "approval-2" }] } as never);
    const result = await platformTaxApprovalRepository.list({ status: "PENDING_REVIEW", page: 2, pageSize: 1 });
    const [sql, values] = vi.mocked(pool.query).mock.calls[0] ?? [];
    expect(sql).toContain("a.tenant_id IS NULL");
    expect(sql).toContain("a.status = $1");
    expect(sql).toContain("r.tenant_id IS NULL");
    expect(values).toEqual(["PENDING_REVIEW", 2, 1]);
    expect(result.rows).toHaveLength(1);
    expect(result.hasMore).toBe(true);
  });
});
