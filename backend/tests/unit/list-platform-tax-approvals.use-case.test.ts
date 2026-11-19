import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/modules/tax/repositories/platform-tax-approval.repository.js", () => ({
  platformTaxApprovalRepository: { list: vi.fn() },
}));
import { platformTaxApprovalRepository } from "../../src/modules/tax/repositories/platform-tax-approval.repository.js";
import { listPlatformTaxApprovals } from "../../src/modules/tax/application/list-platform-tax-approvals.use-case.js";

describe("listPlatformTaxApprovals", () => {
  beforeEach(() => vi.clearAllMocks());

  it("maps the approval queue and pagination metadata", async () => {
    vi.mocked(platformTaxApprovalRepository.list).mockResolvedValue({
      rows: [{ approval_id: "approval-1", status: "PENDING_REVIEW" }],
      hasMore: true,
    } as never);
    const result = await listPlatformTaxApprovals.execute({ status: "PENDING_REVIEW", page: 1, pageSize: 25 }, "issuer", "reviewer");
    expect(platformTaxApprovalRepository.list).toHaveBeenCalledWith({ status: "PENDING_REVIEW", page: 1, pageSize: 25 }, "issuer", "reviewer");
    expect(result).toMatchObject({ items: [{ approval_id: "approval-1" }], page: 1, pageSize: 25, hasMore: true, scope: "GLOBAL" });
  });
});
