-- ZENOX Finance only.
-- Allow progressive draft persistence while keeping final submission strict.
-- Additive replacement of existing draft RPC implementations; no table data is dropped.

CREATE OR REPLACE FUNCTION public.finance_create_registration_draft(
  p_identity_issuer text,
  p_identity_subject text,
  p_payload jsonb
)
RETURNS TABLE (draft_id uuid, payload jsonb, created_at timestamptz, updated_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_id uuid;
  v_currency text;
BEGIN
  IF p_identity_issuer IS NULL OR length(btrim(p_identity_issuer)) NOT BETWEEN 1 AND 500
     OR p_identity_issuer <> btrim(p_identity_issuer)
     OR p_identity_subject IS NULL OR length(btrim(p_identity_subject)) NOT BETWEEN 1 AND 500
     OR p_identity_subject <> btrim(p_identity_subject)
     OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object'
     OR (p_payload ? 'organization' AND jsonb_typeof(p_payload -> 'organization') IS DISTINCT FROM 'object')
     OR (p_payload ? 'address' AND jsonb_typeof(p_payload -> 'address') IS DISTINCT FROM 'object')
     OR (p_payload ? 'representative' AND jsonb_typeof(p_payload -> 'representative') IS DISTINCT FROM 'object')
     OR (p_payload ? 'contact' AND jsonb_typeof(p_payload -> 'contact') IS DISTINCT FROM 'object') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_REGISTRATION_DRAFT';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.finance_registration_requests r
     WHERE r.identity_issuer = p_identity_issuer
       AND r.identity_subject = p_identity_subject
       AND r.status = 'PENDING'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'REGISTRATION_ALREADY_SUBMITTED';
  END IF;

  v_currency := upper(btrim(coalesce(p_payload #>> '{organization,defaultCurrency}', '')));
  IF v_currency <> '' AND NOT EXISTS (
    SELECT 1 FROM public.finance_currencies c
     WHERE c.code = v_currency AND c.is_active = true
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'UNSUPPORTED_CURRENCY';
  END IF;

  INSERT INTO public.finance_registration_drafts(identity_issuer, identity_subject, payload)
  VALUES (p_identity_issuer, p_identity_subject, p_payload)
  ON CONFLICT (identity_issuer, identity_subject) WHERE status = 'DRAFT'
  DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()
  RETURNING id INTO v_id;

  RETURN QUERY
  SELECT d.id, d.payload, d.created_at, d.updated_at
    FROM public.finance_registration_drafts d
   WHERE d.id = v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.finance_update_registration_draft(
  p_identity_issuer text,
  p_identity_subject text,
  p_draft_id uuid,
  p_payload jsonb
)
RETURNS TABLE (draft_id uuid, payload jsonb, created_at timestamptz, updated_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_row public.finance_registration_drafts%ROWTYPE;
  v_currency text;
BEGIN
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object'
     OR (p_payload ? 'organization' AND jsonb_typeof(p_payload -> 'organization') IS DISTINCT FROM 'object')
     OR (p_payload ? 'address' AND jsonb_typeof(p_payload -> 'address') IS DISTINCT FROM 'object')
     OR (p_payload ? 'representative' AND jsonb_typeof(p_payload -> 'representative') IS DISTINCT FROM 'object')
     OR (p_payload ? 'contact' AND jsonb_typeof(p_payload -> 'contact') IS DISTINCT FROM 'object') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_REGISTRATION_DRAFT';
  END IF;

  v_currency := upper(btrim(coalesce(p_payload #>> '{organization,defaultCurrency}', '')));
  IF v_currency <> '' AND NOT EXISTS (
    SELECT 1 FROM public.finance_currencies c
     WHERE c.code = v_currency AND c.is_active = true
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'UNSUPPORTED_CURRENCY';
  END IF;

  SELECT * INTO v_row
    FROM public.finance_registration_drafts d
   WHERE d.id = p_draft_id
     AND d.identity_issuer = p_identity_issuer
     AND d.identity_subject = p_identity_subject
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'REGISTRATION_DRAFT_NOT_FOUND';
  END IF;
  IF v_row.status <> 'DRAFT' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'REGISTRATION_DRAFT_NOT_EDITABLE';
  END IF;

  UPDATE public.finance_registration_drafts
     SET payload = p_payload, updated_at = now()
   WHERE id = p_draft_id
  RETURNING id, finance_registration_drafts.payload,
            finance_registration_drafts.created_at, finance_registration_drafts.updated_at
       INTO draft_id, payload, created_at, updated_at;
  RETURN NEXT;
END;
$function$;

CREATE OR REPLACE FUNCTION public.finance_submit_registration_draft(
  p_identity_issuer text,
  p_identity_subject text,
  p_draft_id uuid,
  p_accepted_terms_version text,
  p_accepted_privacy_version text,
  p_correlation_id text
)
RETURNS TABLE (request_id uuid, tenant_id uuid, status text, submitted_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_draft public.finance_registration_drafts%ROWTYPE;
  v_request record;
  v_org jsonb;
  v_addr jsonb;
  v_rep jsonb;
  v_contact jsonb;
  v_currency text;
BEGIN
  IF p_accepted_terms_version IS NULL OR length(btrim(p_accepted_terms_version)) NOT BETWEEN 1 AND 40
     OR p_accepted_privacy_version IS NULL OR length(btrim(p_accepted_privacy_version)) NOT BETWEEN 1 AND 40
     OR p_correlation_id IS NULL OR length(btrim(p_correlation_id)) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_REGISTRATION_CONSENT';
  END IF;

  SELECT * INTO v_draft
    FROM public.finance_registration_drafts d
   WHERE d.id = p_draft_id
     AND d.identity_issuer = p_identity_issuer
     AND d.identity_subject = p_identity_subject
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'REGISTRATION_DRAFT_NOT_FOUND';
  END IF;

  IF v_draft.status = 'SUBMITTED' AND v_draft.submitted_request_id IS NOT NULL THEN
    RETURN QUERY
    SELECT r.id, r.tenant_id, r.status, r.submitted_at
      FROM public.finance_registration_requests r
     WHERE r.id = v_draft.submitted_request_id;
    RETURN;
  END IF;

  v_org := coalesce(v_draft.payload -> 'organization', '{}'::jsonb);
  v_addr := coalesce(v_draft.payload -> 'address', '{}'::jsonb);
  v_rep := coalesce(v_draft.payload -> 'representative', '{}'::jsonb);
  v_contact := coalesce(v_draft.payload -> 'contact', '{}'::jsonb);
  v_currency := upper(btrim(coalesce(v_org ->> 'defaultCurrency', '')));

  IF length(btrim(coalesce(v_org ->> 'legalName', ''))) NOT BETWEEN 2 AND 200
     OR upper(btrim(coalesce(v_org ->> 'countryCode', ''))) !~ '^[A-Z]{2}$'
     OR v_currency !~ '^[A-Z]{3}$'
     OR coalesce(v_addr ->> 'addressType', '') NOT IN ('REGISTERED', 'BUSINESS', 'BILLING')
     OR length(btrim(coalesce(v_addr ->> 'addressLine1', ''))) NOT BETWEEN 1 AND 200
     OR length(btrim(coalesce(v_addr ->> 'city', ''))) NOT BETWEEN 1 AND 120
     OR upper(btrim(coalesce(v_addr ->> 'countryCode', ''))) !~ '^[A-Z]{2}$'
     OR length(btrim(coalesce(v_rep ->> 'fullName', ''))) NOT BETWEEN 2 AND 200
     OR length(btrim(coalesce(v_rep ->> 'role', ''))) NOT BETWEEN 2 AND 100
     OR coalesce(v_rep ->> 'email', '') !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}$'
     OR length(btrim(coalesce(v_contact ->> 'businessEmail', ''))) NOT BETWEEN 3 AND 254
     OR coalesce(v_contact ->> 'businessEmail', '') !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}$' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'REGISTRATION_DRAFT_INCOMPLETE';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.finance_currencies c
     WHERE c.code = v_currency AND c.is_active = true
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'UNSUPPORTED_CURRENCY';
  END IF;

  SELECT * INTO v_request
    FROM public.finance_submit_organization_registration(
      p_identity_issuer,
      p_identity_subject,
      btrim(v_org ->> 'legalName'),
      upper(btrim(v_org ->> 'countryCode')),
      v_currency,
      p_accepted_terms_version,
      p_correlation_id
    );

  UPDATE public.finance_registration_requests
     SET registration_data = v_draft.payload,
         accepted_privacy_version = btrim(p_accepted_privacy_version),
         accepted_privacy_at = now(),
         updated_at = now()
   WHERE id = v_request.request_id;

  UPDATE public.finance_registration_drafts
     SET status = 'SUBMITTED',
         submitted_request_id = v_request.request_id,
         updated_at = now()
   WHERE id = p_draft_id;

  RETURN QUERY SELECT v_request.request_id, v_request.tenant_id, v_request.status, v_request.submitted_at;
END;
$function$;

COMMENT ON FUNCTION public.finance_create_registration_draft(text, text, jsonb) IS
  'Creates or replaces an identity-scoped partial registration draft; complete validation is enforced by submit.';
COMMENT ON FUNCTION public.finance_update_registration_draft(text, text, uuid, jsonb) IS
  'Updates an identity-scoped partial registration draft; complete validation is enforced by submit.';
COMMENT ON FUNCTION public.finance_submit_registration_draft(text, text, uuid, text, text, text) IS
  'Validates every required registration section before atomically submitting the organization request.';
