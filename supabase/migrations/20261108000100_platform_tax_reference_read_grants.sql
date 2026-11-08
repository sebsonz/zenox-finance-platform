-- Platform tax reference read access for the trusted Finance backend.
-- Finance database only. Never apply this migration to ZENOX FRET V2.
-- Browser roles receive no direct access. RLS remains enabled and forced.
-- The current API connection uses the postgres role; finance_runtime is
-- supported as a future least-privilege runtime role when provisioned.

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

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
    EXECUTE 'GRANT SELECT ON TABLE public.finance_tax_jurisdictions TO postgres';
    EXECUTE 'GRANT SELECT ON TABLE public.finance_tax_rules TO postgres';
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
  'Global Finance jurisdiction reference. The trusted backend has read access; browser roles have no direct table grants.';

COMMENT ON TABLE public.finance_tax_rules IS
  'Global and tenant tax rules. Trusted backend read access only in this migration; global writes must use audited platform functions introduced separately.';
