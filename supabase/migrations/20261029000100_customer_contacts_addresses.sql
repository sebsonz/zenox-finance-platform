-- M04 customer contacts and addresses.
-- Additive Finance-only migration; never execute against ZENOX FRET.
-- Tenant isolation is enforced both by composite foreign keys and transaction-local RLS context.

CREATE TABLE IF NOT EXISTS public.finance_customer_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  contact_type text NOT NULL DEFAULT 'GENERAL'
    CHECK (contact_type IN ('GENERAL', 'BILLING', 'TECHNICAL', 'LEGAL', 'OTHER')),
  full_name text NOT NULL CHECK (length(trim(full_name)) BETWEEN 1 AND 200),
  job_title text,
  email text,
  phone text,
  is_primary boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_customer_contacts_tenant_customer_fk
    FOREIGN KEY (tenant_id, customer_id)
    REFERENCES public.finance_customers (tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT finance_customer_contacts_email_length
    CHECK (email IS NULL OR length(email) <= 254),
  CONSTRAINT finance_customer_contacts_phone_length
    CHECK (phone IS NULL OR length(phone) <= 40),
  CONSTRAINT finance_customer_contacts_job_title_length
    CHECK (job_title IS NULL OR length(job_title) <= 120),
  UNIQUE (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS finance_customer_contacts_customer_idx
  ON public.finance_customer_contacts (tenant_id, customer_id, status, id);

CREATE UNIQUE INDEX IF NOT EXISTS finance_customer_contacts_one_primary_active_uq
  ON public.finance_customer_contacts (tenant_id, customer_id)
  WHERE is_primary AND status = 'ACTIVE';

ALTER TABLE public.finance_customer_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_customer_contacts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS finance_customer_contacts_tenant_isolation
  ON public.finance_customer_contacts;
CREATE POLICY finance_customer_contacts_tenant_isolation
  ON public.finance_customer_contacts
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS public.finance_customer_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  address_type text NOT NULL
    CHECK (address_type IN ('REGISTERED', 'BILLING', 'SHIPPING', 'OTHER')),
  label text,
  recipient_name text,
  address_line1 text NOT NULL CHECK (length(trim(address_line1)) BETWEEN 1 AND 200),
  address_line2 text,
  city text NOT NULL CHECK (length(trim(city)) BETWEEN 1 AND 120),
  region text,
  postal_code text,
  country_code char(2) NOT NULL CHECK (country_code ~ '^[A-Z]{2}$'),
  is_primary boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_customer_addresses_tenant_customer_fk
    FOREIGN KEY (tenant_id, customer_id)
    REFERENCES public.finance_customers (tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT finance_customer_addresses_label_length
    CHECK (label IS NULL OR length(label) <= 100),
  CONSTRAINT finance_customer_addresses_recipient_length
    CHECK (recipient_name IS NULL OR length(recipient_name) <= 200),
  CONSTRAINT finance_customer_addresses_line2_length
    CHECK (address_line2 IS NULL OR length(address_line2) <= 200),
  CONSTRAINT finance_customer_addresses_region_length
    CHECK (region IS NULL OR length(region) <= 120),
  CONSTRAINT finance_customer_addresses_postal_length
    CHECK (postal_code IS NULL OR length(postal_code) <= 24),
  UNIQUE (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS finance_customer_addresses_customer_idx
  ON public.finance_customer_addresses (tenant_id, customer_id, status, id);

CREATE UNIQUE INDEX IF NOT EXISTS finance_customer_addresses_one_primary_active_uq
  ON public.finance_customer_addresses (tenant_id, customer_id, address_type)
  WHERE is_primary AND status = 'ACTIVE';

ALTER TABLE public.finance_customer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_customer_addresses FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS finance_customer_addresses_tenant_isolation
  ON public.finance_customer_addresses;
CREATE POLICY finance_customer_addresses_tenant_isolation
  ON public.finance_customer_addresses
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

REVOKE ALL ON TABLE public.finance_customer_contacts, public.finance_customer_addresses FROM PUBLIC;
