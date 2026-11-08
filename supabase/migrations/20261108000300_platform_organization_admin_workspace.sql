-- Super Admin organization workspace: detail, profile maintenance and membership administration.
-- ZENOX Finance only. Source-controlled for review; do not apply without explicit approval.
-- Every operation revalidates the active platform operator inside PostgreSQL.

CREATE OR REPLACE FUNCTION public.finance_get_platform_organization_details(
  p_operator_issuer text, p_operator_subject text, p_tenant_id uuid
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $function$
DECLARE v_result jsonb;
BEGIN
  IF NOT public.finance_is_active_platform_operator(p_operator_issuer, p_operator_subject) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PLATFORM_OPERATOR_REQUIRED';
  END IF;
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_TENANT_ID';
  END IF;
  SELECT jsonb_build_object(
    'id', t.id, 'tenantCode', t.tenant_code, 'legalName', t.legal_name,
    'countryCode', t.country_code, 'defaultCurrency', t.default_currency,
    'status', t.status, 'createdAt', t.created_at, 'updatedAt', t.updated_at,
    'profile', jsonb_build_object(
      'tradeName', p.trade_name, 'timezone', p.timezone,
      'primaryLanguage', p.primary_language, 'supportedLanguages', to_jsonb(p.supported_languages),
      'websiteUrl', p.website_url, 'generalEmail', p.general_email, 'generalPhone', p.general_phone,
      'createdAt', p.created_at, 'updatedAt', p.updated_at
    ),
    'addresses', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', a.id, 'addressType', a.address_type, 'label', a.label,
        'addressLine1', a.address_line1, 'addressLine2', a.address_line2,
        'city', a.city, 'region', a.region, 'postalCode', a.postal_code,
        'countryCode', a.country_code, 'isPrimary', a.is_primary,
        'status', a.status, 'validFrom', a.valid_from, 'validTo', a.valid_to
      ) ORDER BY a.is_primary DESC, a.address_type, a.valid_from DESC)
      FROM public.finance_tenant_addresses a WHERE a.tenant_id = t.id
    ), '[]'::jsonb),
    'members', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', m.id, 'identityIssuer', m.identity_issuer, 'identitySubject', m.identity_subject,
        'role', m.role_code, 'status', m.status, 'invitedBy', m.invited_by,
        'activatedAt', m.activated_at, 'createdAt', m.created_at, 'updatedAt', m.updated_at
      ) ORDER BY CASE m.role_code WHEN 'OWNER' THEN 0 WHEN 'ADMIN' THEN 1 ELSE 2 END, m.created_at, m.id)
      FROM public.finance_user_tenant_memberships m WHERE m.tenant_id = t.id
    ), '[]'::jsonb)
  ) INTO v_result
  FROM public.finance_tenants t
  LEFT JOIN public.finance_tenant_profiles p ON p.tenant_id = t.id
  WHERE t.id = p_tenant_id;
  IF v_result IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'ORGANIZATION_NOT_FOUND';
  END IF;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.finance_platform_update_organization_profile(
  p_operator_issuer text, p_operator_subject text, p_tenant_id uuid,
  p_profile jsonb, p_reason text, p_correlation_id text
) RETURNS TABLE (tenant_id uuid, updated_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $function$
DECLARE v_reason text; v_updated_at timestamptz; v_languages text[]; v_primary_language text;
BEGIN
  IF NOT public.finance_is_active_platform_operator(p_operator_issuer, p_operator_subject) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PLATFORM_OPERATOR_REQUIRED';
  END IF;
  IF p_tenant_id IS NULL OR jsonb_typeof(p_profile) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_ORGANIZATION_PROFILE';
  END IF;
  v_reason := btrim(coalesce(p_reason, ''));
  IF length(v_reason) NOT BETWEEN 10 AND 1000 OR p_correlation_id IS NULL
     OR length(btrim(p_correlation_id)) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_ORGANIZATION_AUDIT_CONTEXT';
  END IF;
  PERFORM 1 FROM public.finance_tenants WHERE id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'ORGANIZATION_NOT_FOUND'; END IF;
  v_primary_language := coalesce(nullif(btrim(p_profile ->> 'primaryLanguage'), ''), 'en');
  IF jsonb_typeof(p_profile -> 'supportedLanguages') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_SUPPORTED_LANGUAGES';
  END IF;
  SELECT array_agg(lang.value) INTO v_languages FROM jsonb_array_elements_text(p_profile -> 'supportedLanguages') AS lang(value);
  IF cardinality(v_languages) NOT BETWEEN 1 AND 20 OR NOT (v_primary_language = ANY(v_languages)) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_SUPPORTED_LANGUAGES';
  END IF;
  INSERT INTO public.finance_tenant_profiles (
    tenant_id, trade_name, timezone, primary_language, supported_languages,
    website_url, general_email, general_phone
  ) VALUES (
    p_tenant_id, nullif(btrim(p_profile ->> 'tradeName'), ''),
    coalesce(nullif(btrim(p_profile ->> 'timezone'), ''), 'UTC'),
    v_primary_language, v_languages, nullif(btrim(p_profile ->> 'websiteUrl'), ''),
    nullif(btrim(p_profile ->> 'generalEmail'), ''), nullif(btrim(p_profile ->> 'generalPhone'), '')
  )
  ON CONFLICT (tenant_id) DO UPDATE SET
    trade_name = EXCLUDED.trade_name, timezone = EXCLUDED.timezone,
    primary_language = EXCLUDED.primary_language, supported_languages = EXCLUDED.supported_languages,
    website_url = EXCLUDED.website_url, general_email = EXCLUDED.general_email,
    general_phone = EXCLUDED.general_phone, updated_at = now()
  RETURNING finance_tenant_profiles.updated_at INTO v_updated_at;
  INSERT INTO public.finance_audit_events
    (tenant_id, actor_type, actor_ref, action, resource_type, resource_id, correlation_id, safe_metadata)
  VALUES (p_tenant_id, 'USER', p_operator_issuer || '|' || p_operator_subject,
    'PLATFORM_ORGANIZATION_PROFILE_UPDATED', 'ORGANIZATION', p_tenant_id, p_correlation_id,
    jsonb_build_object('changedFields', ARRAY['tradeName','timezone','primaryLanguage','supportedLanguages','websiteUrl','generalEmail','generalPhone'], 'reason', v_reason));
  RETURN QUERY SELECT p_tenant_id, v_updated_at;
END;
$function$;

CREATE OR REPLACE FUNCTION public.finance_platform_update_organization_member(
  p_operator_issuer text, p_operator_subject text, p_tenant_id uuid, p_member_id uuid,
  p_role_code text, p_status text, p_reason text, p_correlation_id text
) RETURNS TABLE (member_id uuid, role_code text, status text, updated_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $function$
DECLARE v_current_role text; v_current_status text; v_reason text; v_updated_at timestamptz;
BEGIN
  IF NOT public.finance_is_active_platform_operator(p_operator_issuer, p_operator_subject) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PLATFORM_OPERATOR_REQUIRED';
  END IF;
  IF p_tenant_id IS NULL OR p_member_id IS NULL OR p_role_code IS NULL OR p_status IS NULL
     OR p_role_code NOT IN ('OWNER','ADMIN','FINANCE_MANAGER','FINANCE_OPERATOR','VIEWER')
     OR p_status NOT IN ('PENDING','ACTIVE','SUSPENDED','REVOKED') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_ORGANIZATION_MEMBER_UPDATE';
  END IF;
  v_reason := btrim(coalesce(p_reason, ''));
  IF length(v_reason) NOT BETWEEN 10 AND 1000 OR p_correlation_id IS NULL
     OR length(btrim(p_correlation_id)) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_ORGANIZATION_AUDIT_CONTEXT';
  END IF;
  PERFORM 1 FROM public.finance_tenants WHERE id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'ORGANIZATION_NOT_FOUND'; END IF;
  SELECT m.role_code, m.status INTO v_current_role, v_current_status
    FROM public.finance_user_tenant_memberships m
   WHERE m.tenant_id = p_tenant_id AND m.id = p_member_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'ORGANIZATION_MEMBER_NOT_FOUND'; END IF;
  IF v_current_role = 'OWNER' AND v_current_status = 'ACTIVE'
     AND (p_role_code <> 'OWNER' OR p_status <> 'ACTIVE')
     AND NOT EXISTS (
       SELECT 1 FROM public.finance_user_tenant_memberships m
        WHERE m.tenant_id = p_tenant_id AND m.id <> p_member_id
          AND m.role_code = 'OWNER' AND m.status = 'ACTIVE'
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'LAST_ACTIVE_OWNER';
  END IF;
  UPDATE public.finance_user_tenant_memberships
     SET role_code = p_role_code, status = p_status,
         activated_at = CASE WHEN p_status = 'ACTIVE' THEN coalesce(activated_at, now())
                             WHEN p_status = 'PENDING' THEN NULL ELSE activated_at END,
         updated_at = now()
   WHERE id = p_member_id AND tenant_id = p_tenant_id
  RETURNING finance_user_tenant_memberships.updated_at INTO v_updated_at;
  INSERT INTO public.finance_audit_events
    (tenant_id, actor_type, actor_ref, action, resource_type, resource_id, correlation_id, safe_metadata)
  VALUES (p_tenant_id, 'USER', p_operator_issuer || '|' || p_operator_subject,
    'PLATFORM_ORGANIZATION_MEMBER_UPDATED', 'ORGANIZATION_MEMBER', p_member_id, p_correlation_id,
    jsonb_build_object('previousRole', v_current_role, 'newRole', p_role_code,
      'previousStatus', v_current_status, 'newStatus', p_status, 'reason', v_reason));
  RETURN QUERY SELECT p_member_id, p_role_code, p_status, v_updated_at;
END;
$function$;

REVOKE ALL ON FUNCTION public.finance_get_platform_organization_details(text,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finance_platform_update_organization_profile(text,text,uuid,jsonb,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finance_platform_update_organization_member(text,text,uuid,uuid,text,text,text,text) FROM PUBLIC, anon, authenticated;

DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finance_runtime') THEN
    GRANT EXECUTE ON FUNCTION public.finance_get_platform_organization_details(text,text,uuid) TO finance_runtime;
    GRANT EXECUTE ON FUNCTION public.finance_platform_update_organization_profile(text,text,uuid,jsonb,text,text) TO finance_runtime;
    GRANT EXECUTE ON FUNCTION public.finance_platform_update_organization_member(text,text,uuid,uuid,text,text,text,text) TO finance_runtime;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.finance_get_platform_organization_details(text,text,uuid) TO service_role;
    GRANT EXECUTE ON FUNCTION public.finance_platform_update_organization_profile(text,text,uuid,jsonb,text,text) TO service_role;
    GRANT EXECUTE ON FUNCTION public.finance_platform_update_organization_member(text,text,uuid,uuid,text,text,text,text) TO service_role;
  END IF;
END
$grants$;
