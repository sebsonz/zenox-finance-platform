-- Lot 1: complete issuer and customer billing snapshots for invoice documents.
-- Additive Finance-only migration. Never run against ZENOX FRET.
-- Existing issued invoices remain untouched; their historical artifacts stay authoritative.

ALTER TABLE public.finance_customers
  ADD COLUMN IF NOT EXISTS address_line1 text,
  ADD COLUMN IF NOT EXISTS address_line2 text,
  ADD COLUMN IF NOT EXISTS address_region text,
  ADD COLUMN IF NOT EXISTS address_city text,
  ADD COLUMN IF NOT EXISTS address_postal_code text;

ALTER TABLE public.finance_customers
  ADD CONSTRAINT finance_customers_address_line1_length
    CHECK (address_line1 IS NULL OR length(address_line1) <= 200),
  ADD CONSTRAINT finance_customers_address_line2_length
    CHECK (address_line2 IS NULL OR length(address_line2) <= 200),
  ADD CONSTRAINT finance_customers_address_region_length
    CHECK (address_region IS NULL OR length(address_region) <= 120),
  ADD CONSTRAINT finance_customers_address_city_length
    CHECK (address_city IS NULL OR length(address_city) <= 120),
  ADD CONSTRAINT finance_customers_address_postal_code_length
    CHECK (address_postal_code IS NULL OR length(address_postal_code) <= 24);

ALTER TABLE public.finance_invoices
  ADD COLUMN IF NOT EXISTS issuer_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.finance_invoices
  ADD CONSTRAINT finance_invoices_issuer_snapshot_object
    CHECK (jsonb_typeof(issuer_snapshot) = 'object');

COMMENT ON COLUMN public.finance_customers.address_line1 IS
  'Customer billing address line 1; copied into invoice customer_snapshot when a draft is created or updated.';
COMMENT ON COLUMN public.finance_invoices.issuer_snapshot IS
  'Immutable-at-issuance snapshot of the tenant issuer identity and billing address. Historical issued invoices are not backfilled.';
