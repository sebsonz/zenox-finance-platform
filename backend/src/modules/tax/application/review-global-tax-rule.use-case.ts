import { platformTaxApprovalRepository } from "../repositories/platform-tax-approval.repository.js";

export const reviewGlobalTaxRule = {
  execute(input: {
    approvalId: string; decision: "APPROVE" | "REJECT"; reason: string;
    actorIssuer: string; actorSubject: string; correlationId: string;
  }) {
    return platformTaxApprovalRepository.review(input);
  },
};
