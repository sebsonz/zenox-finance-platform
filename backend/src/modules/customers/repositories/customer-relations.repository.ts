import type { PoolClient } from "pg";
import type {
  CreateCustomerAddressInput,
  CreateCustomerContactInput,
  UpdateCustomerContactInput,
  UpdateCustomerAddressInput,
  ListCustomerRelationsQuery,
} from "../validators/customer-relations.schema.js";

export interface FinanceCustomerContact {
  id: string;
  customerId: string;
  contactType: "GENERAL" | "BILLING" | "TECHNICAL" | "LEGAL" | "OTHER";
  fullName: string;
  jobTitle: string | null;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
  status: "ACTIVE" | "ARCHIVED";
  createdAt: string;
  updatedAt: string;
}

export interface FinanceCustomerAddress {
  id: string;
  customerId: string;
  addressType: "REGISTERED" | "BILLING" | "SHIPPING" | "OTHER";
  label: string | null;
  recipientName: string | null;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  region: string | null;
  postalCode: string | null;
  countryCode: string;
  isPrimary: boolean;
  status: "ACTIVE" | "ARCHIVED";
  createdAt: string;
  updatedAt: string;
}

interface ContactRow {
  id: string; customer_id: string; contact_type: FinanceCustomerContact["contactType"];
  full_name: string; job_title: string | null; email: string | null; phone: string | null;
  is_primary: boolean; status: FinanceCustomerContact["status"]; created_at: Date; updated_at: Date;
}
interface AddressRow {
  id: string; customer_id: string; address_type: FinanceCustomerAddress["addressType"];
  label: string | null; recipient_name: string | null; address_line1: string; address_line2: string | null;
  city: string; region: string | null; postal_code: string | null; country_code: string;
  is_primary: boolean; status: FinanceCustomerAddress["status"]; created_at: Date; updated_at: Date;
}

const contactColumns = "id, customer_id, contact_type, full_name, job_title, email, phone, is_primary, status, created_at, updated_at";
const addressColumns = "id, customer_id, address_type, label, recipient_name, address_line1, address_line2, city, region, postal_code, country_code, is_primary, status, created_at, updated_at";

function mapContact(row: ContactRow): FinanceCustomerContact {
  return {
    id: row.id, customerId: row.customer_id, contactType: row.contact_type,
    fullName: row.full_name, jobTitle: row.job_title, email: row.email, phone: row.phone,
    isPrimary: row.is_primary, status: row.status,
    createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
  };
}
function mapAddress(row: AddressRow): FinanceCustomerAddress {
  return {
    id: row.id, customerId: row.customer_id, addressType: row.address_type,
    label: row.label, recipientName: row.recipient_name, addressLine1: row.address_line1,
    addressLine2: row.address_line2, city: row.city, region: row.region,
    postalCode: row.postal_code, countryCode: row.country_code, isPrimary: row.is_primary,
    status: row.status, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
  };
}

export const customerRelationsRepository = {
  async createContact(client: PoolClient, tenantId: string, customerId: string, input: CreateCustomerContactInput) {
    const result = await client.query<ContactRow>(
      `INSERT INTO public.finance_customer_contacts
        (tenant_id, customer_id, contact_type, full_name, job_title, email, phone, is_primary)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING ${contactColumns}`,
      [tenantId, customerId, input.contactType, input.fullName, input.jobTitle ?? null,
       input.email ?? null, input.phone ?? null, input.isPrimary],
    );
    return mapContact(result.rows[0]!);
  },

  async updateContact(client: PoolClient, customerId: string, contactId: string, input: UpdateCustomerContactInput) {
    const columns: Record<keyof UpdateCustomerContactInput, string> = {
      contactType: "contact_type", fullName: "full_name", jobTitle: "job_title",
      email: "email", phone: "phone", isPrimary: "is_primary",
    };
    const entries = Object.entries(input) as [keyof UpdateCustomerContactInput, unknown][];
    const assignments = entries.map(([key], index) => `${columns[key]} = ${index + 3}`);
    const result = await client.query<ContactRow>(
      `UPDATE public.finance_customer_contacts SET ${assignments.join(", ")}, updated_at = now()
       WHERE customer_id = $1 AND id = $2 AND status = 'ACTIVE'
       RETURNING ${contactColumns}`,
      [customerId, contactId, ...entries.map(([, value]) => value)],
    );
    return result.rows[0] ? mapContact(result.rows[0]) : null;
  },

  async archiveContact(client: PoolClient, customerId: string, contactId: string) {
    const result = await client.query<ContactRow>(
      `UPDATE public.finance_customer_contacts SET status = 'ARCHIVED', is_primary = false, updated_at = now()
       WHERE customer_id = $1 AND id = $2 AND status = 'ACTIVE'
       RETURNING ${contactColumns}`,
      [customerId, contactId],
    );
    return result.rows[0] ? mapContact(result.rows[0]) : null;
  },

  async listContacts(client: PoolClient, customerId: string, query: ListCustomerRelationsQuery) {
    const result = await client.query<ContactRow>(
      `SELECT ${contactColumns} FROM public.finance_customer_contacts
       WHERE customer_id = $1 AND status = $2 AND ($3::uuid IS NULL OR id > $3::uuid)
       ORDER BY id ASC LIMIT $4`,
      [customerId, query.status, query.cursor ?? null, query.limit + 1],
    );
    return result.rows.map(mapContact);
  },

  async createAddress(client: PoolClient, tenantId: string, customerId: string, input: CreateCustomerAddressInput) {
    const result = await client.query<AddressRow>(
      `INSERT INTO public.finance_customer_addresses
        (tenant_id, customer_id, address_type, label, recipient_name, address_line1, address_line2,
         city, region, postal_code, country_code, is_primary)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING ${addressColumns}`,
      [tenantId, customerId, input.addressType, input.label ?? null, input.recipientName ?? null,
       input.addressLine1, input.addressLine2 ?? null, input.city, input.region ?? null,
       input.postalCode ?? null, input.countryCode, input.isPrimary],
    );
    return mapAddress(result.rows[0]!);
  },

  async updateAddress(client: PoolClient, customerId: string, addressId: string, input: UpdateCustomerAddressInput) {
    const columns: Record<keyof UpdateCustomerAddressInput, string> = {
      addressType: "address_type", label: "label", recipientName: "recipient_name",
      addressLine1: "address_line1", addressLine2: "address_line2", city: "city",
      region: "region", postalCode: "postal_code", countryCode: "country_code", isPrimary: "is_primary",
    };
    const entries = Object.entries(input) as [keyof UpdateCustomerAddressInput, unknown][];
    const assignments = entries.map(([key], index) => `${columns[key]} = ${index + 3}`);
    const result = await client.query<AddressRow>(
      `UPDATE public.finance_customer_addresses SET ${assignments.join(", ")}, updated_at = now()
       WHERE customer_id = $1 AND id = $2 AND status = 'ACTIVE'
       RETURNING ${addressColumns}`,
      [customerId, addressId, ...entries.map(([, value]) => value)],
    );
    return result.rows[0] ? mapAddress(result.rows[0]) : null;
  },

  async archiveAddress(client: PoolClient, customerId: string, addressId: string) {
    const result = await client.query<AddressRow>(
      `UPDATE public.finance_customer_addresses SET status = 'ARCHIVED', is_primary = false, updated_at = now()
       WHERE customer_id = $1 AND id = $2 AND status = 'ACTIVE'
       RETURNING ${addressColumns}`,
      [customerId, addressId],
    );
    return result.rows[0] ? mapAddress(result.rows[0]) : null;
  },

  async listAddresses(client: PoolClient, customerId: string, query: ListCustomerRelationsQuery) {
    const result = await client.query<AddressRow>(
      `SELECT ${addressColumns} FROM public.finance_customer_addresses
       WHERE customer_id = $1 AND status = $2 AND ($3::uuid IS NULL OR id > $3::uuid)
       ORDER BY id ASC LIMIT $4`,
      [customerId, query.status, query.cursor ?? null, query.limit + 1],
    );
    return result.rows.map(mapAddress);
  },
};
