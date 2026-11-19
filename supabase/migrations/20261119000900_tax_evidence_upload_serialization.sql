-- Serialize evidence registration with assignment approval.
-- Prevent an upload from racing an assignment transition to ACTIVE/REVOKED.
-- Finance database only. Migration runner owns transaction boundaries.

CREATE OR REPLACE FUNCTION public.finance_add_tax_assignment_evidence(
  p_assignment_id uuid,
  p_tenant_id uuid,
  p_document_type text,
  p_filename text,
  p_content_type text,
  p_byte_size bigint,
  p_sha256 text,
  p_storage_path text,
  p_actor_issuer text,
  p_actor_subject text,
  p_correlation_id text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
DECLARE
  v_id uuid := gen_random_uuid();
  v_status text;
BEGIN
  IF p_assignment_id IS NULL OR p_tenant_id IS NULL
     OR p_document_type NOT IN ('TAX_REGISTRATION','BUSINESS_REGISTRATION','PROOF_OF_ADDRESS','AUTHORIZATION_LETTER','OTHER')
     OR p_filename IS NULL OR length(p_filename) NOT BETWEEN 1 AND 180
     OR p_content_type NOT IN ('application/pdf','image/jpeg','image/png')
     OR p_byte_size IS NULL OR p_byte_size NOT BETWEEN 1 AND 10485760
     OR p_sha256 IS NULL OR p_sha256 !~ '^[a-f0-9]{64}$'
     OR p_storage_path IS NULL OR p_storage_path NOT LIKE p_assignment_id::text || '/%'
     OR p_actor_issuer IS NULL OR length(btrim(p_actor_issuer)) NOT BETWEEN 1 AND 500
     OR p_actor_subject IS NULL OR length(btrim(p_actor_subject)) NOT BETWEEN 1 AND 500
     OR p_correlation_id IS NULL OR length(btrim(p_correlation_id)) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_TAX_ASSIGNMENT_EVIDENCE';
  END IF;

  -- The assignment row is the serialization point shared with approval.
  SELECT a.status
    INTO v_status
    FROM public.finance_tenant_tax_jurisdictions a
   WHERE a.id=p_assignment_id
     AND a.tenant_id=p_tenant_id
   FOR UPDATE;

  IF NOT FOUND OR v_status <> 'PENDING_REVIEW' THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='TAX_ASSIGNMENT_NOT_EDITABLE';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.finance_user_tenant_memberships m
     WHERE m.tenant_id=p_tenant_id
       AND m.identity_issuer=p_actor_issuer
       AND m.identity_subject=p_actor_subject
       AND m.status='ACTIVE'
       AND m.role_code IN ('OWNER','ADMIN','FINANCE_MANAGER')
  ) AND NOT public.finance_is_active_platform_operator(p_actor_issuer,p_actor_subject) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='TAX_ASSIGNMENT_MANAGE_REQUIRED';
  END IF;

  INSERT INTO public.finance_tax_assignment_evidence
    (id,assignment_id,tenant_id,document_type,original_filename,content_type,byte_size,sha256,
     storage_path,uploaded_by_issuer,uploaded_by_subject)
  VALUES
    (v_id,p_assignment_id,p_tenant_id,p_document_type,p_filename,p_content_type,p_byte_size,
     p_sha256,p_storage_path,p_actor_issuer,p_actor_subject);

  INSERT INTO public.finance_platform_tax_audit_events
    (actor_issuer,actor_subject,action,resource_type,resource_id,tenant_id,correlation_id,safe_metadata)
  VALUES
    (p_actor_issuer,p_actor_subject,'TAX_ASSIGNMENT_EVIDENCE_UPLOADED','TAX_ASSIGNMENT_EVIDENCE',
     v_id,p_tenant_id,p_correlation_id,
     jsonb_build_object('assignmentId',p_assignment_id,'sha256',p_sha256));

  RETURN v_id;
END
$fn$;

REVOKE ALL ON FUNCTION public.finance_add_tax_assignment_evidence(uuid,uuid,text,text,text,bigint,text,text,text,text,text) FROM PUBLIC;
DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON FUNCTION public.finance_add_tax_assignment_evidence(uuid,uuid,text,text,text,bigint,text,text,text,text,text) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON FUNCTION public.finance_add_tax_assignment_evidence(uuid,uuid,text,text,text,bigint,text,text,text,text,text) FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
    GRANT EXECUTE ON FUNCTION public.finance_add_tax_assignment_evidence(uuid,uuid,text,text,text,bigint,text,text,text,text,text) TO service_role;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='finance_runtime') THEN
    GRANT EXECUTE ON FUNCTION public.finance_add_tax_assignment_evidence(uuid,uuid,text,text,text,bigint,text,text,text,text,text) TO finance_runtime;
  END IF;
END
$grants$;
