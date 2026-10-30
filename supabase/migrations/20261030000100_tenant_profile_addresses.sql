-- M02 tenant company profile and address history.
-- Additive Finance-only migration. Do not execute against ZENOX FRET.
-- Sensitive tax/regulatory identifiers are intentionally excluded until the
-- encryption, key-management and HMAC fingerprint contract is implemented.

CREATE TABLE IF NOT EXISTS public.finance_tenant_profiles (
  tenant_id uuid PRIMARY KEY REFERENCES public.finance_tenants (id) ON DELETE RESTRICT,
  trade_name text,
  timezone text NOT NULL DEFAULT 'UTC',
  primary_language text NOT NULL DEFAULT 'en',
  supported_languages text[] NOT NULL DEFAULT ARRAY['en']::text[],
  website_url text,
  general_email text,
  general_phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_tenant_profiles_trade_name_length
    CHECK (trade_name IS NULL OR length(trim(trade_name)) <= 200),
  CONSTRAINT finance_tenant_profiles_timezone_length
    CHECK (length(trim(timezone)) BETWEEN 1 AND 80),
  CONSTRAINT finance_tenant_profiles_primary_language_length
    CHECK (length(trim(primary_language)) BETWEEN 2 AND 35),
  CONSTRAINT finance_tenant_profiles_supported_languages_count
    CHECK (cardinality(supported_languages) BETWEEN 1 AND 20),
  CONSTRAINT finance_tenant_profiles_primary_language_supported
    CHECK (primary_language = ANY (supported_languages)),
  CONSTRAINT finance_tenant_profiles_website_length
    CHECK (website_url IS NULL OR length(website_url) <= 2048),
  CONSTRAINT finance_tenant_profiles_email_length
    CHECK (general_email IS NULL OR length(general_email) <= 254),
  CONSTRAINT finance_tenant_profiles_phone_length
    CHECK (general_phone IS NULL OR length(general_phone) <= 40)
);

CREATE TABLE IF NOT EXISTS public.finance_tenant_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.finance_tenants (id) ON DELETE RESTRICT,
  address_type text NOT NULL CHECK (address_type IN ('REGISTERED', 'BUSINESS', 'BILLING', 'OTHER')),
  label text,
  address_line1 text NOT NULL CHECK (length(trim(address_line1)) BETWEEN 1 AND 200),
  address_line2 text,
  city text NOT NULL CHECK (length(trim(city)) BETWEEN 1 AND 120),
  region text,
  postal_code text,
  country_code char(2) NOT NULL CHECK (country_code ~ '^[A-Z]{2}$'),
  is_primary boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  valid_from date NOT NULL,
  valid_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_tenant_addresses_validity CHECK (valid_to IS NULL OR valid_to >= valid_from),
  CONSTRAINT finance_tenant_addresses_label_length CHECK (label IS NULL OR length(label) <= 100),
  CONSTRAINT finance_tenant_addresses_line2_length CHECK (address_line2 IS NULL OR length(address_line2) <= 200),
  CONSTRAINT finance_tenant_addresses_region_length CHECK (region IS NULL OR length(region) <= 120),
  CONSTRAINT finance_tenant_addresses_postal_length CHECK (postal_code IS NULL OR length(postal_code) <= 24),
  UNIQUE (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS finance_tenant_addresses_tenant_status_idx
  ON public.finance_tenant_addresses (tenant_id, status, address_type, id);

CREATE UNIQUE INDEX IF NOT EXISTS finance_tenant_addresses_one_primary_active_type_uq
  ON public.finance_tenant_addresses (tenant_id, address_type)
  WHERE is_primary AND status = 'ACTIVE';

ALTER TABLE public.finance_tenant_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_tenant_profiles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS finance_tenant_profiles_tenant_isolation ON public.finance_tenant_profiles;
CREATE POLICY finance_tenant_profiles_tenant_isolation
  ON public.finance_tenant_profiles FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE public.finance_tenant_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_tenant_addresses FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS finance_tenant_addresses_tenant_isolation ON public.finance_tenant_addresses;
CREATE POLICY finance_tenant_addresses_tenant_isolation
  ON public.finance_tenant_addresses FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

REVOKE ALL ON TABLE public.finance_tenant_profiles, public.finance_tenant_addresses FROM PUBLIC;
