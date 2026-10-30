/**
 * Public application contract for other Finance domains.
 * Consumers must not import Tax repositories, validators or internal services.
 */
export { listTaxJurisdictions } from "./application/list-tax-jurisdictions.use-case.js";
export type { TaxJurisdictionListQuery } from "./schemas/tax-jurisdiction-list.schema.js";
