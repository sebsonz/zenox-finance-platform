-- Read-only organization directory for the ZENOX Finance platform console.
-- Finance database only. Never apply this migration to ZENOX FRET V2.
-- Exposes a minimal organization projection only to active platform operators.

CREATE OR REPLACE FUNCTION public.finance_list_platform_organizations(
  p_operator_issuer text,
  p_operator_subject text
)
RETURNS TABLE (
  tenant_id uuid,
  tenant_code text,
  legal_name text,
  country_code char(2),
  default_currency char(3),
  status text,
  created_at timestamptz
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
  SELECT t.id, t.tenant_code, t.legal_name, t.country_code,
         t.default_currency, t.status, t.created_at
    FROM public.finance_tenants AS t
   ORDER BY t.created_at DESC, t.id DESC
   LIMIT 500;
END;
$function$;

REVOKE ALL ON FUNCTION public.finance_list_platform_organizations(text, text) FROM PUBLIC;

DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.finance_list_platform_organizations(text, text) TO service_role;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finance_runtime') THEN
    GRANT EXECUTE ON FUNCTION public.finance_list_platform_organizations(text, text) TO finance_runtime;
  END IF;
END
$grants$;

COMMENT ON FUNCTION public.finance_list_platform_organizations(text, text) IS
  'Read-only minimal organization directory for active platform operators; no tenant profile or member data is exposed.';
