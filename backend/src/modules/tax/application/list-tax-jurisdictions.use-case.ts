import type { TaxJurisdictionListQuery } from "../schemas/tax-jurisdiction-list.schema.js";
import { taxJurisdictionRepository } from "../repositories/tax-jurisdiction.repository.js";

export const listTaxJurisdictions = {
  execute(query: TaxJurisdictionListQuery) {
    return taxJurisdictionRepository.listActive(query);
  },
};
