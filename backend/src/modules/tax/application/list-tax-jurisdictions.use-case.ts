import type { TaxJurisdictionListQuery } from "../schemas/tax-jurisdiction-list.schema.js";
import { taxJurisdictionRepository } from "../repositories/tax-jurisdiction.repository.js";

export const listTaxJurisdictions = {
  async execute(query: TaxJurisdictionListQuery) {
    const page = await taxJurisdictionRepository.listActive(query);
    return {
      items: page.items.map((row) => ({
        id: row.id,
        code: row.code,
        countryCode: row.country_code,
        name: row.name,
        jurisdictionLevel: row.jurisdiction_level,
        parentId: row.parent_id,
        isActive: row.is_active,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      })),
      page: page.page,
      pageSize: page.pageSize,
      hasMore: page.hasMore,
    };
  },
};
