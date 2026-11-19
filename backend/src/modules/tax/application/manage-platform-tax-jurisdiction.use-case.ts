import { platformTaxJurisdictionAdminRepository, type TaxJurisdictionInput, type TaxJurisdictionLevelInput } from "../repositories/platform-tax-jurisdiction-admin.repository.js";

export const managePlatformTaxJurisdiction = {
  upsert(input: TaxJurisdictionInput): Promise<string> {
    return platformTaxJurisdictionAdminRepository.upsert(input);
  },
  upsertLevel(input: TaxJurisdictionLevelInput): Promise<string> {
    return platformTaxJurisdictionAdminRepository.upsertLevel(input);
  },
  listLevels(countryCode: string) {
    return platformTaxJurisdictionAdminRepository.listLevels(countryCode);
  },
  listAuditEvents(page: number, pageSize: number) {
    return platformTaxJurisdictionAdminRepository.listAuditEvents(page, pageSize);
  },
};
