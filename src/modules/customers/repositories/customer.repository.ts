import type { PoolClient } from "pg";
import type { CreateCustomerInput, ListCustomersQuery } from "../validators/customer.schema.js";

export interface FinanceCustomer {
  id: string;
  customerCode: string;
  customerType: "BUSINESS" | "INDIVIDUAL";
  legalName: string;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  countryCode: string;
  taxIdentifier: string | null;
  registrationIdentifier: string | null;
  defaultCurrency: string | null;
  status: "ACTIVE" | "ARCHIVED";
  createdAt: string;
  updatedAt: string;
}

interface CustomerRow {
  id: string;
  customer_code: string;
  customer_type: "BUSINESS" | "INDIVIDUAL";
  legal_name: string;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  country_code: string;
  tax_identifier: string | null;
  registration_identifier: string | null;
  default_currency: string | null;
  status: "ACTIVE" | "ARCHIVED";
  created_at: Date;
  updated_at: Date;
}

function mapCustomer(row: CustomerRow): FinanceCustomer {
  return {
    id: row.id,
    customerCode: row.customer_code,
    customerType: row.customer_type,
    legalName: row.legal_name,
    displayName: row.display_name,
    email: row.email,
    phone: row.phone,
    countryCode: row.country_code,
    taxIdentifier: row.tax_identifier,
    registrationIdentifier: row.registration_identifier,
    defaultCurrency: row.default_currency,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

const customerColumns = `id, customer_code, customer_type, legal_name, display_name,
  email, phone, country_code, tax_identifier, registration_identifier,
  default_currency, status, created_at, updated_at`;

export const customerRepository = {
  async create(
    client: PoolClient,
    tenantId: string,
    principalId: string,
    input: CreateCustomerInput,
  ): Promise<FinanceCustomer> {
    const result = await client.query<CustomerRow>(
      `INSERT INTO public.finance_customers (
        tenant_id, customer_code, customer_type, legal_name, display_name,
        email, phone, country_code, tax_identifier, registration_identifier,
        default_currency, external_system, external_customer_id, metadata,
        created_by_principal_id
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15
      )
      RETURNING ${customerColumns}`,
      [
        tenantId, input.customerCode, input.customerType, input.legalName,
        input.displayName ?? null, input.email ?? null, input.phone ?? null,
        input.countryCode, input.taxIdentifier ?? null,
        input.registrationIdentifier ?? null, input.defaultCurrency ?? null,
        input.externalSystem ?? null, input.externalCustomerId ?? null,
        JSON.stringify(input.metadata), principalId,
      ],
    );
    return mapCustomer(result.rows[0]!);
  },

  async findById(
    client: PoolClient,
    customerId: string,
  ): Promise<FinanceCustomer | null> {
    const result = await client.query<CustomerRow>(
      `SELECT ${customerColumns}
         FROM public.finance_customers
        WHERE id = $1
        LIMIT 1`,
      [customerId],
    );
    return result.rows[0] ? mapCustomer(result.rows[0]) : null;
  },

  async list(
    client: PoolClient,
    query: ListCustomersQuery,
  ): Promise<FinanceCustomer[]> {
    const result = await client.query<CustomerRow>(
      `SELECT ${customerColumns}
         FROM public.finance_customers
        WHERE status = $1
          AND ($2::text IS NULL OR legal_name ILIKE '%' || $2 || '%' OR customer_code ILIKE '%' || $2 || '%')
          AND ($3::uuid IS NULL OR id > $3::uuid)
        ORDER BY id ASC
        LIMIT $4`,
      [query.status, query.q ?? null, query.cursor ?? null, query.limit],
    );
    return result.rows.map(mapCustomer);
  },
};
