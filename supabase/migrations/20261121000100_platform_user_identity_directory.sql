-- ZENOX Finance — Platform user identity directory (Lot 1).
-- Database migration for the platform identity directory (Lot 1). Apply to DEV only after the approved deployment procedure.
-- Reads Auth identity metadata and existing Finance memberships; creates no
-- new identity store and never exposes credentials, tokens or raw user metadata.

CREATE OR REPLACE FUNCTION public.finance_list_platform_user_directory(
  p_operator_issuer text,
  p_operator_subject text,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 25,
  p_query text DEFAULT NULL,
  p_status text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
DECLARE
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 25), 10), 100);
  v_query text := nullif(btrim(coalesce(p_query, '')), '');
  v_status text := nullif(btrim(coalesce(p_status, '')), '');
  v_total bigint;
  v_items jsonb;
BEGIN
  IF NOT public.finance_is_active_platform_operator(p_operator_issuer, p_operator_subject) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PLATFORM_OPERATOR_REQUIRED';
  END IF;
  IF v_status IS NOT NULL AND v_status NOT IN ('ACTIVE', 'SUSPENDED', 'DELETED') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_USER_DIRECTORY_STATUS';
  END IF;

  WITH identity_rows AS (
    SELECT u.id, u.email, u.email_confirmed_at, u.created_at, u.last_sign_in_at,
      CASE WHEN u.deleted_at IS NOT NULL THEN 'DELETED'
           WHEN u.banned_until IS NOT NULL AND u.banned_until > now() THEN 'SUSPENDED'
           ELSE 'ACTIVE' END AS account_status,
      (SELECT o.status FROM public.finance_platform_operators o
        WHERE o.identity_issuer = p_operator_issuer AND o.identity_subject = u.id::text
        LIMIT 1) AS platform_operator_status
    FROM auth.users u
    WHERE (v_query IS NULL OR
      strpos(lower(coalesce(u.email, '')), lower(v_query)) > 0 OR
      u.id::text = v_query)
      AND (v_status IS NULL OR
        CASE WHEN u.deleted_at IS NOT NULL THEN 'DELETED'
             WHEN u.banned_until IS NOT NULL AND u.banned_until > now() THEN 'SUSPENDED'
             ELSE 'ACTIVE' END = v_status)
  )
  SELECT count(*) INTO v_total FROM identity_rows;

  WITH identity_rows AS (
    SELECT u.id, u.email, u.email_confirmed_at, u.created_at, u.last_sign_in_at,
      CASE WHEN u.deleted_at IS NOT NULL THEN 'DELETED'
           WHEN u.banned_until IS NOT NULL AND u.banned_until > now() THEN 'SUSPENDED'
           ELSE 'ACTIVE' END AS account_status,
      (SELECT o.status FROM public.finance_platform_operators o
        WHERE o.identity_issuer = p_operator_issuer AND o.identity_subject = u.id::text
        LIMIT 1) AS platform_operator_status
    FROM auth.users u
    WHERE (v_query IS NULL OR
      strpos(lower(coalesce(u.email, '')), lower(v_query)) > 0 OR
      u.id::text = v_query)
      AND (v_status IS NULL OR
        CASE WHEN u.deleted_at IS NOT NULL THEN 'DELETED'
             WHEN u.banned_until IS NOT NULL AND u.banned_until > now() THEN 'SUSPENDED'
             ELSE 'ACTIVE' END = v_status)
    ORDER BY u.created_at DESC, u.id DESC
    LIMIT v_page_size OFFSET (v_page - 1) * v_page_size
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'identity_subject', i.id::text,
    'email', i.email,
    'email_confirmed_at', i.email_confirmed_at,
    'created_at', i.created_at,
    'last_sign_in_at', i.last_sign_in_at,
    'account_status', i.account_status,
    'platform_operator_status', i.platform_operator_status,
    'organizations', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'tenantId', m.tenant_id,
        'tenantCode', t.tenant_code,
        'legalName', t.legal_name,
        'role', m.role_code,
        'status', m.status
      ) ORDER BY t.legal_name)
      FROM public.finance_user_tenant_memberships m
      JOIN public.finance_tenants t ON t.id = m.tenant_id
      WHERE m.identity_issuer = p_operator_issuer
        AND m.identity_subject = i.id::text
    ), '[]'::jsonb)
  )), '[]'::jsonb) INTO v_items
  FROM identity_rows i;

  RETURN jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'page', v_page,
    'pageSize', v_page_size
  );
END;
$function$;

-- The backend currently connects through Supavisor as postgres.
-- Keep the directory function unavailable to PUBLIC, anon, authenticated and service_role.
REVOKE ALL ON FUNCTION
  public.finance_list_platform_user_directory(text, text, integer, integer, text, text)
FROM PUBLIC;

REVOKE ALL ON FUNCTION
  public.finance_list_platform_user_directory(text, text, integer, integer, text, text)
FROM anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  public.finance_list_platform_user_directory(text, text, integer, integer, text, text)
TO postgres;

COMMENT ON FUNCTION public.finance_list_platform_user_directory(text, text, integer, integer, text, text) IS
  'Platform-operator-only, paginated identity directory. Exposes minimal identity metadata and existing tenant memberships; no auth secrets or raw metadata.';
