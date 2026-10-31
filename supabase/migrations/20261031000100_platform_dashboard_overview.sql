-- Platform overview aggregates. Finance database only; never apply to ZENOX FRET V2.
-- The function is the only cross-tenant read boundary for the platform dashboard.
CREATE OR REPLACE FUNCTION public.finance_get_platform_dashboard_overview(
  p_operator_issuer text,
  p_operator_subject text
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.finance_is_active_platform_operator(p_operator_issuer, p_operator_subject) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PLATFORM_OPERATOR_REQUIRED';
  END IF;

  SELECT jsonb_build_object(
    'generatedAt', clock_timestamp(),
    'organizations', (
      SELECT jsonb_build_object(
        'total', count(*)::bigint,
        'active', count(*) FILTER (WHERE status = 'ACTIVE')::bigint,
        'pending', count(*) FILTER (WHERE status = 'PENDING')::bigint,
        'suspended', count(*) FILTER (WHERE status = 'SUSPENDED')::bigint,
        'disabled', count(*) FILTER (WHERE status = 'DISABLED')::bigint
      ) FROM public.finance_tenants
    ),
    'registrations', (
      SELECT jsonb_build_object(
        'total', count(*)::bigint,
        'pending', count(*) FILTER (WHERE status = 'PENDING')::bigint,
        'approved', count(*) FILTER (WHERE status = 'APPROVED')::bigint,
        'rejected', count(*) FILTER (WHERE status = 'REJECTED')::bigint
      ) FROM public.finance_registration_requests
    ),
    'users', (
      SELECT jsonb_build_object(
        'totalMemberships', count(*)::bigint,
        'activeMemberships', count(*) FILTER (WHERE status = 'ACTIVE')::bigint,
        'distinctIdentities', count(DISTINCT (identity_issuer, identity_subject))::bigint
      ) FROM public.finance_user_tenant_memberships
    ),
    'invoices', (
      SELECT jsonb_build_object(
        'total', count(*)::bigint,
        'draft', count(*) FILTER (WHERE status = 'DRAFT')::bigint,
        'issued', count(*) FILTER (WHERE status = 'ISSUED')::bigint,
        'cancelled', count(*) FILTER (WHERE status = 'CANCELLED')::bigint
      ) FROM public.finance_invoices
    ),
    'registrationTrend', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('date', d.day::text, 'count', coalesce(r.total, 0)::bigint) ORDER BY d.day), '[]'::jsonb)
      FROM generate_series(current_date - 13, current_date, interval '1 day') AS d(day)
      LEFT JOIN (
        SELECT submitted_at::date AS day, count(*) AS total
          FROM public.finance_registration_requests
         WHERE submitted_at >= current_date - 13
         GROUP BY submitted_at::date
      ) r ON r.day = d.day::date
    ),
    'organizationsByCountry', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('countryCode', country_code, 'count', total) ORDER BY total DESC, country_code), '[]'::jsonb)
      FROM (
        SELECT country_code, count(*)::bigint AS total
          FROM public.finance_tenants
         GROUP BY country_code
         ORDER BY count(*) DESC, country_code
         LIMIT 8
      ) countries
    )
  ) INTO result;

  RETURN result;
END;
$function$;

REVOKE ALL ON FUNCTION public.finance_get_platform_dashboard_overview(text, text) FROM PUBLIC;

DO $grants$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['service_role', 'finance_runtime', 'finance_runtime_test'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION public.finance_get_platform_dashboard_overview(text, text) TO %I',
        role_name
      );
    END IF;
  END LOOP;
END;
$grants$;

COMMENT ON FUNCTION public.finance_get_platform_dashboard_overview(text, text) IS
  'Returns strictly aggregated cross-tenant platform metrics only after verifying an active platform operator identity.';
