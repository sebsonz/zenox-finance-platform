-- M20 operator review of private registration evidence.
ALTER TABLE public.finance_registration_documents
  ADD CONSTRAINT finance_registration_document_review_state_check
  CHECK (
    (status NOT IN ('ACCEPTED','REJECTED'))
    OR (reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL)
  );

CREATE OR REPLACE FUNCTION public.finance_list_registration_documents_for_review(
  p_operator_issuer text, p_operator_subject text, p_request_id uuid
)
RETURNS TABLE (
  id uuid, document_type text, original_filename text, content_type text,
  byte_size bigint, sha256 char(64), status text, review_note text, created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
BEGIN
  IF NOT public.finance_is_active_platform_operator(p_operator_issuer,p_operator_subject) THEN
    RAISE EXCEPTION 'PLATFORM_OPERATOR_REQUIRED' USING ERRCODE='42501';
  END IF;
  RETURN QUERY
  SELECT d.id,d.document_type,d.original_filename,d.content_type,d.byte_size,d.sha256,d.status,d.review_note,d.created_at
    FROM public.finance_registration_documents d
    JOIN public.finance_registration_drafts r ON r.id=d.draft_id
   WHERE r.submitted_request_id=p_request_id
     AND d.status<>'REMOVED'
     AND NOT (r.identity_issuer=p_operator_issuer AND r.identity_subject=p_operator_subject)
   ORDER BY d.created_at,d.id;
END
$fn$;

CREATE OR REPLACE FUNCTION public.finance_get_registration_document_for_review(
  p_operator_issuer text, p_operator_subject text, p_request_id uuid, p_document_id uuid
)
RETURNS TABLE (storage_path text, content_type text, original_filename text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
BEGIN
  IF NOT public.finance_is_active_platform_operator(p_operator_issuer,p_operator_subject) THEN
    RAISE EXCEPTION 'PLATFORM_OPERATOR_REQUIRED' USING ERRCODE='42501';
  END IF;
  RETURN QUERY
  SELECT d.storage_path,d.content_type,d.original_filename
    FROM public.finance_registration_documents d
    JOIN public.finance_registration_drafts r ON r.id=d.draft_id
   WHERE r.submitted_request_id=p_request_id AND d.id=p_document_id
     AND d.status<>'REMOVED'
     AND NOT (r.identity_issuer=p_operator_issuer AND r.identity_subject=p_operator_subject);
END
$fn$;

CREATE OR REPLACE FUNCTION public.finance_review_registration_document(
  p_operator_issuer text, p_operator_subject text, p_request_id uuid,
  p_document_id uuid, p_decision text, p_note text
)
RETURNS TABLE (id uuid, status text, reviewed_at timestamptz, review_note text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
DECLARE updated_row public.finance_registration_documents%ROWTYPE;
BEGIN
  IF NOT public.finance_is_active_platform_operator(p_operator_issuer,p_operator_subject) THEN
    RAISE EXCEPTION 'PLATFORM_OPERATOR_REQUIRED' USING ERRCODE='42501';
  END IF;
  IF p_decision NOT IN ('ACCEPT','REJECT') OR (p_decision='REJECT' AND length(btrim(coalesce(p_note,''))) NOT BETWEEN 10 AND 1000)
     OR (p_note IS NOT NULL AND length(p_note)>1000) THEN
    RAISE EXCEPTION 'INVALID_DOCUMENT_REVIEW' USING ERRCODE='22023';
  END IF;
  UPDATE public.finance_registration_documents d
     SET status=CASE p_decision WHEN 'ACCEPT' THEN 'ACCEPTED' ELSE 'REJECTED' END,
         reviewed_at=now(), reviewed_by=p_operator_issuer||'|'||p_operator_subject,
         review_note=nullif(btrim(p_note),''),
         updated_at=now()
    FROM public.finance_registration_drafts r
   WHERE d.id=p_document_id AND d.draft_id=r.id
     AND r.submitted_request_id=p_request_id
     AND d.status IN ('UPLOADED','ACCEPTED','REJECTED')
     AND NOT (r.identity_issuer=p_operator_issuer AND r.identity_subject=p_operator_subject)
  RETURNING d.* INTO updated_row;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DOCUMENT_NOT_REVIEWABLE' USING ERRCODE='P0002';
  END IF;
  RETURN QUERY SELECT updated_row.id,updated_row.status,updated_row.reviewed_at,updated_row.review_note;
END
$fn$;

REVOKE ALL ON FUNCTION public.finance_list_registration_documents_for_review(text,text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finance_get_registration_document_for_review(text,text,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finance_review_registration_document(text,text,uuid,uuid,text,text) FROM PUBLIC;
DO $grants$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='finance_runtime') THEN
  GRANT EXECUTE ON FUNCTION public.finance_list_registration_documents_for_review(text,text,uuid) TO finance_runtime;
  GRANT EXECUTE ON FUNCTION public.finance_get_registration_document_for_review(text,text,uuid,uuid) TO finance_runtime;
  GRANT EXECUTE ON FUNCTION public.finance_review_registration_document(text,text,uuid,uuid,text,text) TO finance_runtime;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
  GRANT EXECUTE ON FUNCTION public.finance_list_registration_documents_for_review(text,text,uuid) TO service_role;
  GRANT EXECUTE ON FUNCTION public.finance_get_registration_document_for_review(text,text,uuid,uuid) TO service_role;
  GRANT EXECUTE ON FUNCTION public.finance_review_registration_document(text,text,uuid,uuid,text,text) TO service_role;
 END IF;
END
$grants$;
