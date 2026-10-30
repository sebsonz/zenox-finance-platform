import type { PoolClient } from "pg";
import type {
  TenantAddress,
  TenantProfile,
} from "../domain/tenant-profile.types.js";
import type {
  CreateTenantAddressInput,
  UpdateTenantProfileInput,
} from "../schemas/tenant-profile.schema.js";

interface TenantProfileRow {
  tenant_id: string;
  trade_name: string | null;
  timezone: string;
  primary_language: string;
  supported_languages: string[];
  website_url: string | null;
  general_email: string | null;
  general_phone: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface TenantAddressRow {
  id: string;
  tenant_id: string;
  address_type: TenantAddress["addressType"];
  label: string | null;
  address_line1: string;
  address_line2: string | null;
  city: string;
  region: string | null;
  postal_code: string | null;
  country_code: string;
  is_primary: boolean;
  status: TenantAddress["status"];
  valid_from: string;
  valid_to: string | null;
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapProfile(row: TenantProfileRow): TenantProfile {
  return {
    tenantId: row.tenant_id,
    tradeName: row.trade_name,
    timezone: row.timezone,
    primaryLanguage: row.primary_language,
    supportedLanguages: row.supported_languages,
    websiteUrl: row.website_url,
    generalEmail: row.general_email,
    generalPhone: row.general_phone,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function mapAddress(row: TenantAddressRow): TenantAddress {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    addressType: row.address_type,
    label: row.label,
    addressLine1: row.address_line1,
    addressLine2: row.address_line2,
    city: row.city,
    region: row.region,
    postalCode: row.postal_code,
    countryCode: row.country_code,
    isPrimary: row.is_primary,
    status: row.status,
    validFrom: row.valid_from,
    validTo: row.valid_to,
  };
}

const profileColumns = `tenant_id, trade_name, timezone, primary_language,
  supported_languages, website_url, general_email, general_phone,
  created_at, updated_at`;

const addressColumns = `id, tenant_id, address_type, label, address_line1,
  address_line2, city, region, postal_code, country_code, is_primary, status,
  valid_from::text, valid_to::text`;

export const tenantProfileRepository = {
  async getProfile(client: PoolClient, tenantId: string): Promise<TenantProfile | null> {
    const result = await client.query<TenantProfileRow>(
      `SELECT ${profileColumns}
         FROM public.finance_tenant_profiles
        WHERE tenant_id = $1
        LIMIT 1`,
      [tenantId],
    );
    return result.rows[0] ? mapProfile(result.rows[0]) : null;
  },

  async upsertProfile(
    client: PoolClient,
    tenantId: string,
    input: UpdateTenantProfileInput,
  ): Promise<TenantProfile> {
    const result = await client.query<TenantProfileRow>(
      `INSERT INTO public.finance_tenant_profiles (
        tenant_id, trade_name, timezone, primary_language, supported_languages,
        website_url, general_email, general_phone
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (tenant_id) DO UPDATE SET
        trade_name = EXCLUDED.trade_name,
        timezone = EXCLUDED.timezone,
        primary_language = EXCLUDED.primary_language,
        supported_languages = EXCLUDED.supported_languages,
        website_url = EXCLUDED.website_url,
        general_email = EXCLUDED.general_email,
        general_phone = EXCLUDED.general_phone,
        updated_at = now()
      RETURNING ${profileColumns}`,
      [
        tenantId,
        input.tradeName ?? null,
        input.timezone,
        input.primaryLanguage,
        input.supportedLanguages,
        input.websiteUrl ?? null,
        input.generalEmail ?? null,
        input.generalPhone ?? null,
      ],
    );
    return mapProfile(result.rows[0]!);
  },

  async listActiveAddresses(
    client: PoolClient,
    tenantId: string,
  ): Promise<readonly TenantAddress[]> {
    const result = await client.query<TenantAddressRow>(
      `SELECT ${addressColumns}
         FROM public.finance_tenant_addresses
        WHERE tenant_id = $1 AND status = 'ACTIVE'
        ORDER BY is_primary DESC, address_type ASC, valid_from DESC, id ASC`,
      [tenantId],
    );
    return result.rows.map(mapAddress);
  },

  async createAddress(
    client: PoolClient,
    tenantId: string,
    input: CreateTenantAddressInput,
  ): Promise<TenantAddress> {
    const result = await client.query<TenantAddressRow>(
      `INSERT INTO public.finance_tenant_addresses (
        tenant_id, address_type, label, address_line1, address_line2, city,
        region, postal_code, country_code, is_primary, valid_from, valid_to
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING ${addressColumns}`,
      [
        tenantId,
        input.addressType,
        input.label ?? null,
        input.addressLine1,
        input.addressLine2 ?? null,
        input.city,
        input.region ?? null,
        input.postalCode ?? null,
        input.countryCode,
        input.isPrimary,
        input.validFrom,
        input.validTo ?? null,
      ],
    );
    return mapAddress(result.rows[0]!);
  },
};
