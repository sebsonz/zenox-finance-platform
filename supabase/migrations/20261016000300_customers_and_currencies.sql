-- Finance-owned customer directory and currency reference data.
-- Never run against ZENOX FRET. Transaction boundaries are managed by scripts/migrate.ts.

CREATE TABLE IF NOT EXISTS public.finance_currencies (
  code char(3) PRIMARY KEY,
  name text NOT NULL,
  minor_unit smallint NOT NULL CHECK (minor_unit BETWEEN 0 AND 4),
  is_active boolean NOT NULL DEFAULT true,
  source text NOT NULL DEFAULT 'ISO_4217',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (code ~ '^[A-Z]{3}$'),
  CHECK (length(trim(name)) BETWEEN 1 AND 100)
);

COMMENT ON TABLE public.finance_currencies IS
  'Finance-owned currency reference. Populate and update through reviewed reference-data migrations; do not accept client-supplied precision as authoritative.';

CREATE TABLE IF NOT EXISTS public.finance_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.finance_tenants(id),
  customer_code text NOT NULL,
  customer_type text NOT NULL CHECK (customer_type IN ('BUSINESS', 'INDIVIDUAL')),
  legal_name text NOT NULL,
  display_name text,
  email text,
  phone text,
  country_code char(2) NOT NULL,
  tax_identifier text,
  registration_identifier text,
  default_currency char(3) REFERENCES public.finance_currencies(code),
  external_system text,
  external_customer_id text,
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_principal_id uuid REFERENCES public.finance_integration_principals(id),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, customer_code),
  CHECK (customer_code ~ '^[A-Z0-9][A-Z0-9_-]{1,59}$'),
  CHECK (country_code ~ '^[A-Z]{2}$'),
  CHECK (email IS NULL OR length(email) <= 254),
  CHECK (phone IS NULL OR length(phone) <= 40),
  CHECK (external_system IS NULL OR length(external_system) <= 80),
  CHECK (external_customer_id IS NULL OR length(external_customer_id) <= 160),
  CHECK (jsonb_typeof(metadata) = 'object'),
  CHECK ((external_system IS NULL) = (external_customer_id IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS finance_customers_external_identity_uq
  ON public.finance_customers (tenant_id, external_system, external_customer_id)
  WHERE external_system IS NOT NULL;

CREATE INDEX IF NOT EXISTS finance_customers_tenant_name_idx
  ON public.finance_customers (tenant_id, lower(legal_name));

ALTER TABLE public.finance_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_customers FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS finance_customers_tenant_isolation
  ON public.finance_customers;
CREATE POLICY finance_customers_tenant_isolation
  ON public.finance_customers
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE public.finance_currencies DISABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.finance_currencies, public.finance_customers FROM PUBLIC;

-- Grant only after provisioning a dedicated backend database role. Do not grant
-- access to anon/authenticated browser roles. Currency writes stay migration-only.
