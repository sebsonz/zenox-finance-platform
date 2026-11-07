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

-- Backfill only editable drafts. Issued invoices and their immutable snapshots/artifacts are untouched.
UPDATE public.finance_invoices AS i
   SET issuer_snapshot = jsonb_strip_nulls(jsonb_build_object(
     'legalName', t.legal_name,
     'tradeName', p.trade_name,
     'countryCode', COALESCE(a.country_code, t.country_code),
     'address', a.address_line1,
     'addressLine2', a.address_line2,
     'city', a.city,
     'region', a.region,
     'postalCode', a.postal_code,
     'email', p.general_email,
     'phone', p.general_phone,
     'websiteUrl', p.website_url
   )),
       customer_snapshot = i.customer_snapshot || jsonb_strip_nulls(jsonb_build_object(
         'address', c.address_line1,
         'addressLine2', c.address_line2,
         'region', c.address_region,
         'city', c.address_city,
         'postalCode', c.address_postal_code
       ))
  FROM public.finance_tenants AS t
  JOIN public.finance_customers AS c ON c.tenant_id = t.id
  LEFT JOIN public.finance_tenant_profiles AS p ON p.tenant_id = t.id
  LEFT JOIN LATERAL (
    SELECT address_line1, address_line2, city, region, postal_code, country_code
      FROM public.finance_tenant_addresses
     WHERE tenant_id = t.id
       AND status = 'ACTIVE'
       AND valid_from <= CURRENT_DATE
       AND (valid_to IS NULL OR valid_to >= CURRENT_DATE)
     ORDER BY is_primary DESC,
              CASE address_type WHEN 'BILLING' THEN 0 WHEN 'REGISTERED' THEN 1 WHEN 'BUSINESS' THEN 2 ELSE 3 END,
              valid_from DESC, id
     LIMIT 1
  ) AS a ON true
 WHERE i.tenant_id = t.id
   AND c.id = i.customer_id
   AND i.status = 'DRAFT'
   AND i.issuer_snapshot = '{}'::jsonb;
