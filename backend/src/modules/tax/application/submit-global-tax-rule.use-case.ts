import { platformTaxApprovalRepository } from "../repositories/platform-tax-approval.repository.js";

export const submitGlobalTaxRule = {
  execute(input: { ruleId: string; actorIssuer: string; actorSubject: string; correlationId: string }): Promise<string> {
    return platformTaxApprovalRepository.submit(input.ruleId, input.actorIssuer, input.actorSubject, input.correlationId);
  },
};
