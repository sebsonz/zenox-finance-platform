import { platformTaxDelegationRepository, type PlatformTaxDelegationInput } from "../repositories/platform-tax-delegation.repository.js";

export const managePlatformTaxDelegations = {
  isActiveRuleReviewer(identityIssuer: string, identitySubject: string): Promise<boolean> {
    return platformTaxDelegationRepository.isActiveRuleReviewer(identityIssuer, identitySubject);
  },
  list(actorIssuer: string, actorSubject: string) {
    return platformTaxDelegationRepository.list(actorIssuer, actorSubject);
  },
  create(input: PlatformTaxDelegationInput): Promise<string> {
    return platformTaxDelegationRepository.create(input);
  },
  revoke(input: { delegationId: string; reason: string; actorIssuer: string; actorSubject: string; correlationId: string }): Promise<boolean> {
    return platformTaxDelegationRepository.revoke(input);
  },
};
