import { platformTaxJurisdictionRepository } from "../repositories/platform-tax-jurisdiction.repository.js";

export const listPlatformTaxJurisdictions = {
  async execute(identityIssuer: string, identitySubject: string) {
    const items = await platformTaxJurisdictionRepository.listForOperator(identityIssuer, identitySubject);
    return { items, total: items.length, scope: "GLOBAL" as const };
  },
};
