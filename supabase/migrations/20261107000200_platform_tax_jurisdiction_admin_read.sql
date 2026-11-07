-- Platform-only jurisdiction directory, including inactive reference rows.
-- Finance database only. Never apply this migration to ZENOX FRET V2.
-- SECURITY DEFINER is narrowly scoped and re-checks the active operator identity.

CREATE OR REPLACE FUNCTION public.finance_list_platform_tax_jurisdictions(
  p_operator_issuer text,
  p_operator_subject text
)
RETURNS TABLE (
  id uuid,
  code text,
  country_code char(2),
  name text,
  jurisdiction_level text,
  parent_id uuid,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF NOT public.finance_is_active_platform_operator(p_operator_issuer, p_operator_subject) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PLATFORM_OPERATOR_REQUIRED';
  END IF;

  RETURN QUERY
  SELECT j.id, j.code, j.country_code, j.name, j.jurisdiction_level,
         j.parent_id, j.is_active, j.created_at, j.updated_at
    FROM public.finance_tax_jurisdictions AS j
   ORDER BY j.country_code, j.jurisdiction_level, j.code;
END;
$function$;

REVOKE ALL ON FUNCTION public.finance_list_platform_tax_jurisdictions(text, text) FROM PUBLIC;

DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.finance_list_platform_tax_jurisdictions(text, text) FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.finance_list_platform_tax_jurisdictions(text, text) FROM authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.finance_list_platform_tax_jurisdictions(text, text) FROM service_role';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finance_runtime') THEN
    GRANT EXECUTE ON FUNCTION public.finance_list_platform_tax_jurisdictions(text, text) TO finance_runtime;
  END IF;
END
$grants$;

COMMENT ON FUNCTION public.finance_list_platform_tax_jurisdictions(text, text) IS
  'Lists active and inactive global tax jurisdictions only for an authenticated active platform operator. Does not mutate reference data.';
