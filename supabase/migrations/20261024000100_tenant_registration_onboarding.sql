-- Tenant self-registration and onboarding. Finance database only.
-- Never apply Finance migrations to ZENOX FRET V2.
-- The browser has no direct table access: narrowly scoped SECURITY DEFINER
-- functions are the only write/read boundary for pending registration requests.

CREATE TABLE IF NOT EXISTS public.finance_registration_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE
    REFERENCES public.finance_tenants(id) ON DELETE RESTRICT,
  identity_issuer text NOT NULL,
  identity_subject text NOT NULL,
  legal_name text NOT NULL,
  country_code char(2) NOT NULL,
  default_currency char(3) NOT NULL,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  accepted_terms_version text NOT NULL,
  accepted_terms_at timestamptz NOT NULL DEFAULT now(),
  rejection_reason text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decision_actor text,
  CHECK (length(btrim(legal_name)) BETWEEN 2 AND 200),
  CHECK (country_code ~ '^[A-Z]{2}$'),
  CHECK (default_currency ~ '^[A-Z]{3}$'),
  CHECK (length(identity_issuer) BETWEEN 1 AND 500),
  CHECK (length(identity_subject) BETWEEN 1 AND 500),
  CHECK (identity_issuer = btrim(identity_issuer)),
  CHECK (identity_subject = btrim(identity_subject)),
  CHECK (length(accepted_terms_version) BETWEEN 1 AND 40),
  CHECK (
    (status = 'PENDING' AND decided_at IS NULL AND decision_actor IS NULL)
    OR (status IN ('APPROVED', 'REJECTED') AND decided_at IS NOT NULL AND decision_actor IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS finance_registration_one_pending_per_identity_idx
  ON public.finance_registration_requests (identity_issuer, identity_subject)
  WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS finance_registration_identity_time_idx
  ON public.finance_registration_requests (identity_issuer, identity_subject, submitted_at DESC);

ALTER TABLE public.finance_registration_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_registration_requests FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.finance_registration_requests FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.finance_submit_organization_registration(
  p_identity_issuer text,
  p_identity_subject text,
  p_legal_name text,
  p_country_code text,
  p_default_currency text,
  p_accepted_terms_version text,
  p_correlation_id text
)
RETURNS TABLE (
  request_id uuid,
  tenant_id uuid,
  status text,
  submitted_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_tenant_id uuid;
  v_request_id uuid;
  v_tenant_code text;
  v_slug text;
  v_submitted_at timestamptz;
  v_legal_name text;
  v_country_code text;
  v_currency text;
  v_terms_version text;
BEGIN
  v_legal_name := btrim(p_legal_name);
  v_country_code := upper(btrim(p_country_code));
  v_currency := upper(btrim(p_default_currency));
  v_terms_version := btrim(p_accepted_terms_version);

  IF p_identity_issuer IS NULL OR length(btrim(p_identity_issuer)) NOT BETWEEN 1 AND 500
     OR p_identity_issuer <> btrim(p_identity_issuer)
     OR p_identity_subject IS NULL OR length(btrim(p_identity_subject)) NOT BETWEEN 1 AND 500
     OR p_identity_subject <> btrim(p_identity_subject) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_IDENTITY';
  END IF;
  IF v_legal_name IS NULL OR length(v_legal_name) NOT BETWEEN 2 AND 200 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_LEGAL_NAME';
  END IF;
  IF v_country_code !~ '^[A-Z]{2}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_COUNTRY_CODE';
  END IF;
  IF v_currency !~ '^[A-Z]{3}$' OR NOT EXISTS (
    SELECT 1 FROM public.finance_currencies c
     WHERE c.code = v_currency AND c.is_active = true
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'UNSUPPORTED_CURRENCY';
  END IF;
  IF v_terms_version IS NULL OR length(v_terms_version) NOT BETWEEN 1 AND 40 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'TERMS_ACCEPTANCE_REQUIRED';
  END IF;
  IF p_correlation_id IS NULL OR length(p_correlation_id) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_CORRELATION_ID';
  END IF;

  v_slug := left(trim(both '_' from regexp_replace(upper(v_legal_name), '[^A-Z0-9]+', '_', 'g')), 20);
  IF v_slug IS NULL OR v_slug = '' THEN v_slug := 'ORG'; END IF;
  v_tenant_code := 'ORG_' || v_slug || '_' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  INSERT INTO public.finance_tenants
    (tenant_code, legal_name, country_code, default_currency, status)
  VALUES
    (v_tenant_code, v_legal_name, v_country_code, v_currency, 'PENDING')
  RETURNING id INTO v_tenant_id;

  INSERT INTO public.finance_user_tenant_memberships
    (tenant_id, identity_issuer, identity_subject, role_code, status)
  VALUES
    (v_tenant_id, p_identity_issuer, p_identity_subject, 'OWNER', 'PENDING');

  INSERT INTO public.finance_registration_requests
    (tenant_id, identity_issuer, identity_subject, legal_name, country_code,
     default_currency, status, accepted_terms_version)
  VALUES
    (v_tenant_id, p_identity_issuer, p_identity_subject, v_legal_name, v_country_code,
     v_currency, 'PENDING', v_terms_version)
  RETURNING id, finance_registration_requests.submitted_at
       INTO v_request_id, v_submitted_at;

  INSERT INTO public.finance_audit_events
    (tenant_id, actor_type, actor_ref, action, resource_type, resource_id,
     correlation_id, safe_metadata)
  VALUES
    (v_tenant_id, 'USER', p_identity_subject, 'ORGANIZATION_REGISTRATION_SUBMITTED',
     'ORGANIZATION_REGISTRATION', v_request_id, p_correlation_id,
     jsonb_build_object('countryCode', v_country_code, 'defaultCurrency', v_currency,
                        'acceptedTermsVersion', v_terms_version));

  RETURN QUERY SELECT v_request_id, v_tenant_id, 'PENDING'::text, v_submitted_at;
END;
$function$;

CREATE OR REPLACE FUNCTION public.finance_list_my_registration_requests(
  p_identity_issuer text,
  p_identity_subject text
)
RETURNS TABLE (
  request_id uuid,
  tenant_id uuid,
  legal_name text,
  country_code char(2),
  default_currency char(3),
  status text,
  submitted_at timestamptz,
  updated_at timestamptz,
  rejection_reason text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT r.id, r.tenant_id, r.legal_name, r.country_code, r.default_currency,
         r.status, r.submitted_at, r.updated_at, r.rejection_reason
    FROM public.finance_registration_requests r
   WHERE r.identity_issuer = p_identity_issuer
     AND r.identity_subject = p_identity_subject
   ORDER BY r.submitted_at DESC, r.id DESC
   LIMIT 50
$function$;

CREATE OR REPLACE FUNCTION public.finance_get_my_registration_request(
  p_identity_issuer text,
  p_identity_subject text,
  p_request_id uuid
)
RETURNS TABLE (
  request_id uuid,
  tenant_id uuid,
  legal_name text,
  country_code char(2),
  default_currency char(3),
  status text,
  submitted_at timestamptz,
  updated_at timestamptz,
  rejection_reason text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT r.id, r.tenant_id, r.legal_name, r.country_code, r.default_currency,
         r.status, r.submitted_at, r.updated_at, r.rejection_reason
    FROM public.finance_registration_requests r
   WHERE r.identity_issuer = p_identity_issuer
     AND r.identity_subject = p_identity_subject
     AND r.id = p_request_id
   LIMIT 1
$function$;

REVOKE ALL ON FUNCTION public.finance_submit_organization_registration(text, text, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finance_list_my_registration_requests(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finance_get_my_registration_request(text, text, uuid) FROM PUBLIC;

-- Supabase's server-side service role may invoke only these narrowly scoped
-- functions; anon/authenticated and browser clients receive no execution grant.
DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.finance_submit_organization_registration(text, text, text, text, text, text, text) TO service_role;
    GRANT EXECUTE ON FUNCTION public.finance_list_my_registration_requests(text, text) TO service_role;
    GRANT EXECUTE ON FUNCTION public.finance_get_my_registration_request(text, text, uuid) TO service_role;
  END IF;
END
$grants$;

COMMENT ON TABLE public.finance_registration_requests IS
  'Organization onboarding requests. Read/write only through narrowly scoped server-side registration functions.';
