import { platformTaxApprovalRepository, type GlobalTaxApprovalQuery } from "../repositories/platform-tax-approval.repository.js";

export const listPlatformTaxApprovals = {
  async execute(query: GlobalTaxApprovalQuery, actorIssuer: string, actorSubject: string) {
    const result = await platformTaxApprovalRepository.list(query, actorIssuer, actorSubject);
    return {
      items: result.rows,
      page: query.page,
      pageSize: query.pageSize,
      hasMore: result.hasMore,
      scope: "GLOBAL" as const,
    };
  },
};
