-- Platform tax reference read access for the trusted Finance backend.
-- Finance database only. Never apply this migration to ZENOX FRET V2.
-- Browser roles receive no direct access. RLS remains enabled and forced.

DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.finance_tax_jurisdictions FROM anon';
    EXECUTE 'REVOKE ALL ON TABLE public.finance_tax_rules FROM anon';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.finance_tax_jurisdictions FROM authenticated';
    EXECUTE 'REVOKE ALL ON TABLE public.finance_tax_rules FROM authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.finance_tax_jurisdictions FROM service_role';
    EXECUTE 'REVOKE ALL ON TABLE public.finance_tax_rules FROM service_role';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finance_runtime') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.finance_tax_jurisdictions FROM finance_runtime';
    EXECUTE 'REVOKE ALL ON TABLE public.finance_tax_rules FROM finance_runtime';
    EXECUTE 'GRANT SELECT ON TABLE public.finance_tax_jurisdictions TO finance_runtime';
    EXECUTE 'GRANT SELECT ON TABLE public.finance_tax_rules TO finance_runtime';
  END IF;
END
$grants$;

COMMENT ON TABLE public.finance_tax_jurisdictions IS
  'Global Finance jurisdiction reference. finance_runtime has SELECT only; RLS exposes active jurisdictions. Browser roles have no direct table grants.';

COMMENT ON TABLE public.finance_tax_rules IS
  'Global and tenant tax rules. finance_runtime has SELECT only in this migration; global writes must use audited platform functions introduced separately.';
