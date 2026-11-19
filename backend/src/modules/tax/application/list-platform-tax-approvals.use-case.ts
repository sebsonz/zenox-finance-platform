import { platformTaxApprovalRepository, type GlobalTaxApprovalQuery } from "../repositories/platform-tax-approval.repository.js";

export const listPlatformTaxApprovals = {
  async execute(query: GlobalTaxApprovalQuery) {
    const result = await platformTaxApprovalRepository.list(query);
    return {
      items: result.rows,
      page: query.page,
      pageSize: query.pageSize,
      hasMore: result.hasMore,
      scope: "GLOBAL" as const,
    };
  },
};
