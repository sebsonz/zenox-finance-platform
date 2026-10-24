-- Secure platform review of Finance organization registration requests.
-- Finance database only. Never execute this migration against ZENOX FRET V2.

CREATE TABLE IF NOT EXISTS public.finance_platform_operators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_issuer text NOT NULL,
  identity_subject text NOT NULL,
  role_code text NOT NULL DEFAULT 'PLATFORM_ADMIN'
    CHECK (role_code IN ('PLATFORM_ADMIN')),
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'SUSPENDED')),
  created_by_issuer text,
  created_by_subject text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (identity_issuer, identity_subject),
  CHECK (length(identity_issuer) BETWEEN 1 AND 500),
  CHECK (length(identity_subject) BETWEEN 1 AND 500),
  CHECK (identity_issuer = btrim(identity_issuer)),
  CHECK (identity_subject = btrim(identity_subject)),
  CHECK (created_by_issuer IS NULL OR (length(created_by_issuer) BETWEEN 1 AND 500 AND created_by_issuer = btrim(created_by_issuer))),
  CHECK (created_by_subject IS NULL OR (length(created_by_subject) BETWEEN 1 AND 500 AND created_by_subject = btrim(created_by_subject))
);

ALTER TABLE public.finance_platform_operators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_platform_operators FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.finance_platform_operators FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.finance_is_active_platform_operator(
  p_identity_issuer text,
  p_identity_subject text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.finance_platform_operators o
     WHERE o.identity_issuer = p_identity_issuer
       AND o.identity_subject = p_identity_subject
       AND o.status = 'ACTIVE'
  )
$function$;

CREATE OR REPLACE FUNCTION public.finance_list_pending_registration_requests(
  p_operator_issuer text,
  p_operator_subject text
)
RETURNS TABLE (
  request_id uuid,
  tenant_id uuid,
  legal_name text,
  country_code char(2),
  default_currency char(3),
  submitted_at timestamptz
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
  SELECT r.id, r.tenant_id, r.legal_name, r.country_code, r.default_currency, r.submitted_at
    FROM public.finance_registration_requests r
   WHERE r.status = 'PENDING'
   ORDER BY r.submitted_at ASC, r.id ASC
   LIMIT 200;
END;
$function$;

CREATE OR REPLACE FUNCTION public.finance_review_registration_request(
  p_operator_issuer text,
  p_operator_subject text,
  p_request_id uuid,
  p_decision text,
  p_rejection_reason text,
  p_correlation_id text
)
RETURNS TABLE (
  request_id uuid,
  tenant_id uuid,
  status text,
  decided_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_tenant_id uuid;
  v_request_issuer text;
  v_request_subject text;
  v_request_status text;
  v_final_status text;
  v_reason text;
  v_decided_at timestamptz;
  v_rows integer;
BEGIN
  IF NOT public.finance_is_active_platform_operator(p_operator_issuer, p_operator_subject) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PLATFORM_OPERATOR_REQUIRED';
  END IF;
  IF p_request_id IS NULL OR p_decision NOT IN ('APPROVE', 'REJECT') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_REVIEW_DECISION';
  END IF;
  IF p_correlation_id IS NULL OR length(btrim(p_correlation_id)) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_CORRELATION_ID';
  END IF;

  v_reason := btrim(coalesce(p_rejection_reason, ''));
  IF p_decision = 'REJECT' AND length(v_reason) NOT BETWEEN 10 AND 1000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'REJECTION_REASON_REQUIRED';
  END IF;

  SELECT r.tenant_id, r.identity_issuer, r.identity_subject, r.status
    INTO v_tenant_id, v_request_issuer, v_request_subject, v_request_status
    FROM public.finance_registration_requests r
   WHERE r.id = p_request_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'REGISTRATION_NOT_FOUND';
  END IF;
  IF v_request_issuer = p_operator_issuer AND v_request_subject = p_operator_subject THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'SELF_REVIEW_NOT_ALLOWED';
  END IF;
  IF v_request_status <> 'PENDING' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'REGISTRATION_NOT_PENDING';
  END IF;

  IF p_decision = 'APPROVE' THEN
    UPDATE public.finance_tenants
       SET status = 'ACTIVE', updated_at = now()
     WHERE id = v_tenant_id AND status = 'PENDING';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'TENANT_NOT_PENDING';
    END IF;

    UPDATE public.finance_user_tenant_memberships
       SET status = 'ACTIVE', activated_at = now(), updated_at = now()
     WHERE tenant_id = v_tenant_id
       AND identity_issuer = v_request_issuer
       AND identity_subject = v_request_subject
       AND role_code = 'OWNER'
       AND status = 'PENDING';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'OWNER_MEMBERSHIP_NOT_PENDING';
    END IF;
    v_final_status := 'APPROVED';
  ELSE
    UPDATE public.finance_tenants
       SET status = 'DISABLED', updated_at = now()
     WHERE id = v_tenant_id AND status = 'PENDING';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'TENANT_NOT_PENDING';
    END IF;

    UPDATE public.finance_user_tenant_memberships
       SET status = 'REVOKED', updated_at = now()
     WHERE tenant_id = v_tenant_id
       AND identity_issuer = v_request_issuer
       AND identity_subject = v_request_subject
       AND role_code = 'OWNER'
       AND status = 'PENDING';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'OWNER_MEMBERSHIP_NOT_PENDING';
    END IF;
    v_final_status := 'REJECTED';
  END IF;

  v_decided_at := now();
  UPDATE public.finance_registration_requests
     SET status = v_final_status,
         rejection_reason = CASE WHEN v_final_status = 'REJECTED' THEN v_reason ELSE NULL END,
         decided_at = v_decided_at,
         decision_actor = p_operator_issuer || '|' || p_operator_subject,
         updated_at = v_decided_at
   WHERE id = p_request_id AND status = 'PENDING';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'REGISTRATION_NOT_PENDING';
  END IF;

  INSERT INTO public.finance_audit_events
    (tenant_id, actor_type, actor_ref, action, resource_type, resource_id,
     correlation_id, safe_metadata)
  VALUES
    (v_tenant_id, 'USER', p_operator_issuer || '|' || p_operator_subject,
     CASE WHEN v_final_status = 'APPROVED'
       THEN 'ORGANIZATION_REGISTRATION_APPROVED'
       ELSE 'ORGANIZATION_REGISTRATION_REJECTED'
     END,
     'ORGANIZATION_REGISTRATION', p_request_id, p_correlation_id,
     jsonb_build_object('decision', v_final_status));

  RETURN QUERY SELECT p_request_id, v_tenant_id, v_final_status, v_decided_at;
END;
$function$;

REVOKE ALL ON FUNCTION public.finance_is_active_platform_operator(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finance_list_pending_registration_requests(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finance_review_registration_request(text, text, uuid, text, text, text) FROM PUBLIC;

DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.finance_is_active_platform_operator(text, text) TO service_role;
    GRANT EXECUTE ON FUNCTION public.finance_list_pending_registration_requests(text, text) TO service_role;
    GRANT EXECUTE ON FUNCTION public.finance_review_registration_request(text, text, uuid, text, text, text) TO service_role;
  END IF;
END
$grants$;

COMMENT ON TABLE public.finance_platform_operators IS
  'Platform-only reviewer allowlist. Bootstrap must be performed by an authorized DBA; no public promotion path exists.';
