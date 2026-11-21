import { platformTaxRuleRepository } from "../repositories/platform-tax-rule.repository.js";
import type { GlobalTaxRuleDraftInput } from "../validators/tax-rule.schema.js";

export const createGlobalTaxRuleDraft = {
  execute(input: {
    actorIssuer: string;
    actorSubject: string;
    rule: GlobalTaxRuleDraftInput;
    reason: string;
    correlationId: string;
  }): Promise<string> {
    return platformTaxRuleRepository.createGlobalDraft(input);
  },
};
