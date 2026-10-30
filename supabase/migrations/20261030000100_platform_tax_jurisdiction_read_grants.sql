-- Restrict the global jurisdiction reference table to the trusted Finance backend.
-- The existing RLS policy still limits rows to active jurisdictions.
-- This migration is Finance-only and must never be run against ZENOX FRET.

REVOKE ALL ON TABLE public.finance_tax_jurisdictions FROM PUBLIC;

DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.finance_tax_jurisdictions FROM anon';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.finance_tax_jurisdictions FROM authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.finance_tax_jurisdictions FROM service_role';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finance_runtime') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.finance_tax_jurisdictions FROM finance_runtime';
    EXECUTE 'GRANT SELECT ON TABLE public.finance_tax_jurisdictions TO finance_runtime';
  END IF;
END
$grants$;

COMMENT ON TABLE public.finance_tax_jurisdictions IS
  'Global Finance jurisdiction reference. Backend runtime has SELECT only; RLS exposes active rows. Browser roles have no direct table grants.';
