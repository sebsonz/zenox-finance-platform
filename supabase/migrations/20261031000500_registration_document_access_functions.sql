-- Narrow SECURITY DEFINER access for registration-document metadata.
-- The backend passes the authenticated issuer/subject; browser roles never access the table.
CREATE OR REPLACE FUNCTION public.finance_list_registration_documents(
  p_issuer text, p_subject text, p_draft_id uuid
)
RETURNS TABLE (
  id uuid, document_type text, original_filename text, content_type text,
  byte_size bigint, sha256 char(64), status text, created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
  SELECT d.id,d.document_type,d.original_filename,d.content_type,d.byte_size,d.sha256,d.status,d.created_at
    FROM public.finance_registration_documents d
    JOIN public.finance_registration_drafts r ON r.id=d.draft_id
   WHERE d.draft_id=p_draft_id AND r.identity_issuer=p_issuer AND r.identity_subject=p_subject
     AND d.identity_issuer=p_issuer AND d.identity_subject=p_subject AND d.status<>'REMOVED'
   ORDER BY d.created_at,d.id
$fn$;

CREATE OR REPLACE FUNCTION public.finance_create_registration_document(
  p_id uuid, p_draft_id uuid, p_issuer text, p_subject text, p_type text,
  p_filename text, p_content_type text, p_byte_size bigint, p_sha256 text, p_storage_path text
)
RETURNS TABLE (
  id uuid, document_type text, original_filename text, content_type text,
  byte_size bigint, sha256 char(64), status text, created_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.finance_registration_drafts r
     WHERE r.id=p_draft_id AND r.identity_issuer=p_issuer
       AND r.identity_subject=p_subject AND r.status='DRAFT'
     FOR UPDATE
  ) THEN
    RAISE EXCEPTION 'REGISTRATION_DRAFT_NOT_EDITABLE' USING ERRCODE='P0001';
  END IF;
  RETURN QUERY
  INSERT INTO public.finance_registration_documents
    (id,draft_id,identity_issuer,identity_subject,document_type,original_filename,content_type,byte_size,sha256,storage_path)
  VALUES (p_id,p_draft_id,p_issuer,p_subject,p_type,p_filename,p_content_type,p_byte_size,p_sha256,p_storage_path)
  RETURNING finance_registration_documents.id,finance_registration_documents.document_type,
    finance_registration_documents.original_filename,finance_registration_documents.content_type,
    finance_registration_documents.byte_size,finance_registration_documents.sha256,
    finance_registration_documents.status,finance_registration_documents.created_at;
END
$fn$;

CREATE OR REPLACE FUNCTION public.finance_get_registration_document(
  p_issuer text, p_subject text, p_draft_id uuid, p_document_id uuid
)
RETURNS TABLE (storage_path text, content_type text, original_filename text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
  SELECT d.storage_path,d.content_type,d.original_filename
    FROM public.finance_registration_documents d
    JOIN public.finance_registration_drafts r ON r.id=d.draft_id
   WHERE d.id=p_document_id AND d.draft_id=p_draft_id
     AND d.identity_issuer=p_issuer AND d.identity_subject=p_subject
     AND r.identity_issuer=p_issuer AND r.identity_subject=p_subject AND d.status<>'REMOVED'
$fn$;

CREATE OR REPLACE FUNCTION public.finance_remove_registration_document(
  p_issuer text, p_subject text, p_draft_id uuid, p_document_id uuid
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
DECLARE changed integer;
BEGIN
  UPDATE public.finance_registration_documents d
     SET status='REMOVED',updated_at=now()
    FROM public.finance_registration_drafts r
   WHERE d.id=p_document_id AND d.draft_id=p_draft_id
     AND d.identity_issuer=p_issuer AND d.identity_subject=p_subject
     AND r.id=d.draft_id AND r.identity_issuer=p_issuer
     AND r.identity_subject=p_subject AND r.status='DRAFT' AND d.status='UPLOADED';
  GET DIAGNOSTICS changed=ROW_COUNT;
  RETURN changed=1;
END
$fn$;

REVOKE ALL ON FUNCTION public.finance_list_registration_documents(text,text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finance_create_registration_document(uuid,uuid,text,text,text,text,text,bigint,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finance_get_registration_document(text,text,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finance_remove_registration_document(text,text,uuid,uuid) FROM PUBLIC;
DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='finance_runtime') THEN
    GRANT EXECUTE ON FUNCTION public.finance_list_registration_documents(text,text,uuid) TO finance_runtime;
    GRANT EXECUTE ON FUNCTION public.finance_create_registration_document(uuid,uuid,text,text,text,text,text,bigint,text,text) TO finance_runtime;
    GRANT EXECUTE ON FUNCTION public.finance_get_registration_document(text,text,uuid,uuid) TO finance_runtime;
    GRANT EXECUTE ON FUNCTION public.finance_remove_registration_document(text,text,uuid,uuid) TO finance_runtime;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
    GRANT EXECUTE ON FUNCTION public.finance_list_registration_documents(text,text,uuid) TO service_role;
    GRANT EXECUTE ON FUNCTION public.finance_create_registration_document(uuid,uuid,text,text,text,text,text,bigint,text,text) TO service_role;
    GRANT EXECUTE ON FUNCTION public.finance_get_registration_document(text,text,uuid,uuid) TO service_role;
    GRANT EXECUTE ON FUNCTION public.finance_remove_registration_document(text,text,uuid,uuid) TO service_role;
  END IF;
END
$grants$;
