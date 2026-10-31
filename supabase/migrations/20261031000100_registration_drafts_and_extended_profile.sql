-- ZENOX Finance only. Additive onboarding extension; never apply to ZENOX FRET V2.
-- Existing submitted registration functions and statuses remain compatible.

ALTER TABLE public.finance_registration_requests
  ADD COLUMN IF NOT EXISTS registration_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS accepted_privacy_version text,
  ADD COLUMN IF NOT EXISTS accepted_privacy_at timestamptz;

ALTER TABLE public.finance_registration_requests
  ADD CONSTRAINT finance_registration_privacy_version_length_check
  CHECK (accepted_privacy_version IS NULL OR length(accepted_privacy_version) BETWEEN 1 AND 40);

CREATE TABLE IF NOT EXISTS public.finance_registration_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_issuer text NOT NULL,
  identity_subject text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SUBMITTED')),
  submitted_request_id uuid UNIQUE REFERENCES public.finance_registration_requests(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(payload) = 'object'),
  CHECK (length(identity_issuer) BETWEEN 1 AND 500),
  CHECK (length(identity_subject) BETWEEN 1 AND 500),
  CHECK (identity_issuer = btrim(identity_issuer)),
  CHECK (identity_subject = btrim(identity_subject)),
  CHECK (
    (status = 'DRAFT' AND submitted_request_id IS NULL)
    OR (status = 'SUBMITTED' AND submitted_request_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS finance_registration_one_draft_per_identity_idx
  ON public.finance_registration_drafts(identity_issuer, identity_subject)
  WHERE status = 'DRAFT';

CREATE INDEX IF NOT EXISTS finance_registration_drafts_identity_updated_idx
  ON public.finance_registration_drafts(identity_issuer, identity_subject, updated_at DESC);

ALTER TABLE public.finance_registration_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_registration_drafts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.finance_registration_drafts FROM PUBLIC;

DO $revokes$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.finance_registration_drafts FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.finance_registration_drafts FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    REVOKE ALL ON TABLE public.finance_registration_drafts FROM service_role;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finance_runtime') THEN
    REVOKE ALL ON TABLE public.finance_registration_drafts FROM finance_runtime;
  END IF;
END
$revokes$;

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
BEGIN
  IF p_identity_issuer IS NULL OR length(btrim(p_identity_issuer)) NOT BETWEEN 1 AND 500
     OR p_identity_issuer <> btrim(p_identity_issuer)
     OR p_identity_subject IS NULL OR length(btrim(p_identity_subject)) NOT BETWEEN 1 AND 500
     OR p_identity_subject <> btrim(p_identity_subject)
     OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_REGISTRATION_DRAFT';
  END IF;

  IF length(btrim(coalesce(p_payload #>> '{organization,legalName}', ''))) NOT BETWEEN 2 AND 200
     OR upper(btrim(coalesce(p_payload #>> '{organization,countryCode}', ''))) !~ '^[A-Z]{2}$'
     OR upper(btrim(coalesce(p_payload #>> '{organization,defaultCurrency}', ''))) !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_REGISTRATION_DRAFT';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.finance_currencies c
     WHERE c.code = upper(btrim(p_payload #>> '{organization,defaultCurrency}'))
       AND c.is_active = true
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
BEGIN
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object'
     OR length(btrim(coalesce(p_payload #>> '{organization,legalName}', ''))) NOT BETWEEN 2 AND 200
     OR upper(btrim(coalesce(p_payload #>> '{organization,countryCode}', ''))) !~ '^[A-Z]{2}$'
     OR upper(btrim(coalesce(p_payload #>> '{organization,defaultCurrency}', ''))) !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_REGISTRATION_DRAFT';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.finance_currencies c
     WHERE c.code = upper(btrim(p_payload #>> '{organization,defaultCurrency}'))
       AND c.is_active = true
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

CREATE OR REPLACE FUNCTION public.finance_get_my_registration_draft(
  p_identity_issuer text,
  p_identity_subject text,
  p_draft_id uuid
)
RETURNS TABLE (draft_id uuid, payload jsonb, status text, created_at timestamptz, updated_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT d.id, d.payload, d.status, d.created_at, d.updated_at
    FROM public.finance_registration_drafts d
   WHERE d.id = p_draft_id
     AND d.identity_issuer = p_identity_issuer
     AND d.identity_subject = p_identity_subject
   LIMIT 1
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

  v_org := v_draft.payload -> 'organization';
  SELECT * INTO v_request
    FROM public.finance_submit_organization_registration(
      p_identity_issuer,
      p_identity_subject,
      v_org ->> 'legalName',
      v_org ->> 'countryCode',
      v_org ->> 'defaultCurrency',
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

REVOKE ALL ON FUNCTION public.finance_create_registration_draft(text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finance_update_registration_draft(text, text, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finance_get_my_registration_draft(text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finance_submit_registration_draft(text, text, uuid, text, text, text) FROM PUBLIC;

DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.finance_create_registration_draft(text, text, jsonb) TO service_role;
    GRANT EXECUTE ON FUNCTION public.finance_update_registration_draft(text, text, uuid, jsonb) TO service_role;
    GRANT EXECUTE ON FUNCTION public.finance_get_my_registration_draft(text, text, uuid) TO service_role;
    GRANT EXECUTE ON FUNCTION public.finance_submit_registration_draft(text, text, uuid, text, text, text) TO service_role;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finance_runtime') THEN
    GRANT EXECUTE ON FUNCTION public.finance_create_registration_draft(text, text, jsonb) TO finance_runtime;
    GRANT EXECUTE ON FUNCTION public.finance_update_registration_draft(text, text, uuid, jsonb) TO finance_runtime;
    GRANT EXECUTE ON FUNCTION public.finance_get_my_registration_draft(text, text, uuid) TO finance_runtime;
    GRANT EXECUTE ON FUNCTION public.finance_submit_registration_draft(text, text, uuid, text, text, text) TO finance_runtime;
  END IF;
END
$grants$;

COMMENT ON TABLE public.finance_registration_drafts IS
  'Private pre-submission organization onboarding drafts. Access only through identity-scoped SECURITY DEFINER functions.';
