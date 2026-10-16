-- Versioned international tax reference and tenant overrides.
-- Global rules are read-only reference data; tenant-specific rules are isolated by RLS.
-- Never run this migration against ZENOX FRET. The migration runner owns transactions.

CREATE TABLE IF NOT EXISTS public.finance_tax_jurisdictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  country_code char(2) NOT NULL,
  name text NOT NULL,
  jurisdiction_level text NOT NULL
    CHECK (jurisdiction_level IN ('COUNTRY', 'STATE', 'PROVINCE', 'REGION', 'CITY', 'SPECIAL_ZONE')),
  parent_id uuid REFERENCES public.finance_tax_jurisdictions(id),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (country_code ~ '^[A-Z]{2}$'),
  CHECK (code ~ '^[A-Z0-9][A-Z0-9_.:-]{1,79}$'),
  CHECK (length(trim(name)) BETWEEN 1 AND 160),
  CHECK (parent_id IS NULL OR parent_id <> id)
);

CREATE INDEX IF NOT EXISTS finance_tax_jurisdictions_country_idx
  ON public.finance_tax_jurisdictions (country_code, jurisdiction_level);

CREATE TABLE IF NOT EXISTS public.finance_tax_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.finance_tenants(id),
  jurisdiction_id uuid NOT NULL REFERENCES public.finance_tax_jurisdictions(id),
  rule_code text NOT NULL,
  name text NOT NULL,
  tax_type text NOT NULL
    CHECK (tax_type IN (
      'VAT', 'GST', 'SALES_TAX', 'EXCISE', 'WITHHOLDING',
      'CUSTOMS_DUTY', 'IMPORT_TAX', 'ENVIRONMENTAL', 'STAMP_DUTY', 'OTHER'
    )),
  treatment text NOT NULL
    CHECK (treatment IN (
      'STANDARD', 'REDUCED', 'ZERO_RATED', 'EXEMPT', 'REVERSE_CHARGE', 'WITHHOLDING'
    )),
  rate_percent numeric(9,6) NOT NULL CHECK (rate_percent BETWEEN 0 AND 100),
  price_mode text NOT NULL DEFAULT 'EXCLUSIVE'
    CHECK (price_mode IN ('EXCLUSIVE', 'INCLUSIVE')),
  priority integer NOT NULL DEFAULT 100 CHECK (priority BETWEEN 0 AND 10000),
  is_compound boolean NOT NULL DEFAULT false,
  applies_to text NOT NULL DEFAULT 'GOODS'
    CHECK (applies_to IN ('GOODS', 'SERVICES', 'DIGITAL_SERVICES', 'FREIGHT', 'INSURANCE', 'ALL')),
  source_reference text,
  source_url text,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  valid_from date NOT NULL,
  valid_to date,
  status text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'ACTIVE', 'RETIRED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_principal_id uuid REFERENCES public.finance_integration_principals(id),
  UNIQUE (tenant_id, jurisdiction_id, rule_code, version),
  CHECK (rule_code ~ '^[A-Z0-9][A-Z0-9_.:-]{1,79}$'),
  CHECK (length(trim(name)) BETWEEN 1 AND 160),
  CHECK (valid_to IS NULL OR valid_to >= valid_from),
  CHECK (
    treatment NOT IN ('ZERO_RATED', 'EXEMPT', 'REVERSE_CHARGE')
    OR rate_percent = 0
  ),
  CHECK (treatment <> 'WITHHOLDING' OR tax_type = 'WITHHOLDING'),
  CHECK (tax_type <> 'WITHHOLDING' OR treatment = 'WITHHOLDING')
);

CREATE INDEX IF NOT EXISTS finance_tax_rules_lookup_idx
  ON public.finance_tax_rules (jurisdiction_id, tax_type, status, valid_from, valid_to);

CREATE INDEX IF NOT EXISTS finance_tax_rules_tenant_idx
  ON public.finance_tax_rules (tenant_id, jurisdiction_id, rule_code);

ALTER TABLE public.finance_tax_jurisdictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_tax_jurisdictions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.finance_tax_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_tax_rules FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS finance_tax_jurisdictions_read_active
  ON public.finance_tax_jurisdictions;
CREATE POLICY finance_tax_jurisdictions_read_active
  ON public.finance_tax_jurisdictions
  FOR SELECT
  USING (is_active = true);

DROP POLICY IF EXISTS finance_tax_rules_read_global_or_tenant
  ON public.finance_tax_rules;
CREATE POLICY finance_tax_rules_read_global_or_tenant
  ON public.finance_tax_rules
  FOR SELECT
  USING (
    tenant_id IS NULL
    OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );

DROP POLICY IF EXISTS finance_tax_rules_tenant_write
  ON public.finance_tax_rules;
CREATE POLICY finance_tax_rules_tenant_write
  ON public.finance_tax_rules
  FOR ALL
  USING (
    tenant_id IS NOT NULL
    AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  )
  WITH CHECK (
    tenant_id IS NOT NULL
    AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );

REVOKE ALL ON TABLE public.finance_tax_jurisdictions, public.finance_tax_rules FROM PUBLIC;

COMMENT ON TABLE public.finance_tax_jurisdictions IS
  'Tax jurisdictions are hierarchical and versioned tax rules point to a jurisdiction. Populate only from reviewed sources.';
COMMENT ON TABLE public.finance_tax_rules IS
  'Versioned tax rules. NULL tenant_id denotes global reference data; tenant-specific overrides must use a tenant_id. Do not treat schema coverage as proof of legal compliance.';
