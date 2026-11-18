-- ZENOX Finance tax assignment and approval workflow.
-- All mutations are atomic SECURITY DEFINER functions with server-supplied identity.
-- Browser roles never receive direct table access. Finance database only.

CREATE OR REPLACE FUNCTION public.finance_tax_actor_can(
  p_issuer text, p_subject text, p_permission text, p_jurisdiction_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public
AS $fn$
  SELECT public.finance_is_active_platform_operator(p_issuer,p_subject)
    OR EXISTS (
      SELECT 1
        FROM public.finance_platform_tax_delegations d
        LEFT JOIN public.finance_tax_jurisdictions j ON j.id=p_jurisdiction_id
       WHERE d.identity_issuer=p_issuer AND d.identity_subject=p_subject
         AND d.status='ACTIVE'
         AND d.valid_from <= now() AND (d.valid_to IS NULL OR d.valid_to > now())
         AND p_permission = ANY(d.permissions)
         AND (
           d.jurisdiction_id=p_jurisdiction_id
           OR (d.country_code IS NOT NULL AND d.country_code=j.country_code)
         )
    )
$fn$;

CREATE OR REPLACE FUNCTION public.finance_create_tenant_tax_assignment(
  p_tenant_id uuid, p_jurisdiction_id uuid, p_valid_from date, p_valid_to date,
  p_basis_type text, p_basis_reference text, p_actor_issuer text, p_actor_subject text,
  p_initiated_by text, p_correlation_id text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
AS $fn$
DECLARE v_id uuid := gen_random_uuid(); v_is_platform boolean;
BEGIN
  IF p_tenant_id IS NULL OR p_jurisdiction_id IS NULL OR p_valid_from IS NULL
     OR (p_valid_to IS NOT NULL AND p_valid_to < p_valid_from)
     OR p_basis_type !~ '^[A-Z][A-Z0-9_.-]{1,59}$'
     OR (p_basis_reference IS NOT NULL AND length(p_basis_reference)>200)
     OR p_correlation_id IS NULL OR length(btrim(p_correlation_id)) NOT BETWEEN 1 AND 100
     OR p_initiated_by NOT IN ('TENANT','PLATFORM') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_TAX_ASSIGNMENT';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.finance_tenants t WHERE t.id=p_tenant_id AND t.status='ACTIVE') THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='TENANT_NOT_ACTIVE';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.finance_tax_jurisdictions j WHERE j.id=p_jurisdiction_id AND j.is_active) THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='JURISDICTION_NOT_ACTIVE';
  END IF;
  v_is_platform := public.finance_is_active_platform_operator(p_actor_issuer,p_actor_subject);
  IF p_initiated_by='PLATFORM' THEN
    IF NOT v_is_platform THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='PLATFORM_OPERATOR_REQUIRED'; END IF;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM public.finance_user_tenant_memberships m
       WHERE m.tenant_id=p_tenant_id AND m.identity_issuer=p_actor_issuer
         AND m.identity_subject=p_actor_subject AND m.status='ACTIVE'
         AND m.role_code IN ('OWNER','ADMIN','FINANCE_MANAGER')
    ) THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='TENANT_TAX_MANAGE_REQUIRED';
    END IF;
  END IF;
  INSERT INTO public.finance_tenant_tax_jurisdictions
    (id,tenant_id,jurisdiction_id,status,valid_from,valid_to,basis_type,basis_reference,
     initiated_by,requested_by_issuer,requested_by_subject)
  VALUES (v_id,p_tenant_id,p_jurisdiction_id,'PENDING_REVIEW',p_valid_from,p_valid_to,
          p_basis_type,p_basis_reference,p_initiated_by,p_actor_issuer,p_actor_subject);
  INSERT INTO public.finance_platform_tax_audit_events
    (actor_issuer,actor_subject,action,resource_type,resource_id,tenant_id,correlation_id,reason,safe_metadata)
  VALUES (p_actor_issuer,p_actor_subject,'TAX_ASSIGNMENT_REQUESTED','TAX_ASSIGNMENT',v_id,
          p_tenant_id,p_correlation_id,NULL,jsonb_build_object('initiatedBy',p_initiated_by,'jurisdictionId',p_jurisdiction_id));
  RETURN v_id;
END
$fn$;

CREATE OR REPLACE FUNCTION public.finance_add_tax_assignment_evidence(
  p_assignment_id uuid, p_tenant_id uuid, p_document_type text, p_filename text,
  p_content_type text, p_byte_size bigint, p_sha256 text, p_storage_path text,
  p_actor_issuer text, p_actor_subject text, p_correlation_id text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
AS $fn$
DECLARE v_id uuid := gen_random_uuid(); v_status text;
BEGIN
  IF p_storage_path IS NULL OR p_storage_path NOT LIKE p_assignment_id::text || '/%' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_TAX_EVIDENCE_STORAGE_PATH';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.finance_tenant_tax_jurisdictions a
     WHERE a.id=p_assignment_id AND a.tenant_id=p_tenant_id AND a.status='PENDING_REVIEW'
  ) THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='TAX_ASSIGNMENT_NOT_EDITABLE'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.finance_user_tenant_memberships m
     WHERE m.tenant_id=p_tenant_id AND m.identity_issuer=p_actor_issuer
       AND m.identity_subject=p_actor_subject AND m.status='ACTIVE'
       AND m.role_code IN ('OWNER','ADMIN','FINANCE_MANAGER')
  ) AND NOT public.finance_is_active_platform_operator(p_actor_issuer,p_actor_subject) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='TAX_ASSIGNMENT_MANAGE_REQUIRED';
  END IF;
  INSERT INTO public.finance_tax_assignment_evidence
    (id,assignment_id,tenant_id,document_type,original_filename,content_type,byte_size,sha256,
     storage_path,uploaded_by_issuer,uploaded_by_subject)
  VALUES (v_id,p_assignment_id,p_tenant_id,p_document_type,p_filename,p_content_type,p_byte_size,
          p_sha256,p_storage_path,p_actor_issuer,p_actor_subject);
  INSERT INTO public.finance_platform_tax_audit_events
    (actor_issuer,actor_subject,action,resource_type,resource_id,tenant_id,correlation_id,safe_metadata)
  VALUES (p_actor_issuer,p_actor_subject,'TAX_ASSIGNMENT_EVIDENCE_UPLOADED','TAX_ASSIGNMENT_EVIDENCE',
          v_id,p_tenant_id,p_correlation_id,jsonb_build_object('assignmentId',p_assignment_id,'sha256',p_sha256));
  RETURN v_id;
END
$fn$;

CREATE OR REPLACE FUNCTION public.finance_review_tax_assignment_evidence(
  p_evidence_id uuid, p_decision text, p_note text, p_actor_issuer text,
  p_actor_subject text, p_correlation_id text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
AS $fn$
DECLARE v_assignment_id uuid; v_tenant_id uuid; v_jurisdiction_id uuid; v_actor_is_requester boolean;
BEGIN
  SELECT e.assignment_id,e.tenant_id,a.jurisdiction_id,
         (a.requested_by_issuer=p_actor_issuer AND a.requested_by_subject=p_actor_subject)
    INTO v_assignment_id,v_tenant_id,v_jurisdiction_id,v_actor_is_requester
    FROM public.finance_tax_assignment_evidence e
    JOIN public.finance_tenant_tax_jurisdictions a ON a.id=e.assignment_id AND a.tenant_id=e.tenant_id
   WHERE e.id=p_evidence_id FOR UPDATE OF e,a;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='TAX_EVIDENCE_NOT_FOUND'; END IF;
  IF v_actor_is_requester THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='SELF_REVIEW_NOT_ALLOWED'; END IF;
  IF NOT public.finance_tax_actor_can(p_actor_issuer,p_actor_subject,'EVIDENCE_REVIEW',v_jurisdiction_id) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='TAX_EVIDENCE_REVIEW_REQUIRED';
  END IF;
  IF p_decision NOT IN ('VERIFY','REJECT')
     OR (p_decision='REJECT' AND length(btrim(coalesce(p_note,''))) NOT BETWEEN 10 AND 1000)
     OR (p_note IS NOT NULL AND length(p_note)>1000) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_TAX_EVIDENCE_DECISION';
  END IF;
  UPDATE public.finance_tax_assignment_evidence
     SET status=CASE WHEN p_decision='VERIFY' THEN 'VERIFIED' ELSE 'REJECTED' END,
         reviewed_at=now(),reviewed_by_issuer=p_actor_issuer,reviewed_by_subject=p_actor_subject,
         review_note=nullif(btrim(p_note),''),updated_at=now()
   WHERE id=p_evidence_id;
  INSERT INTO public.finance_platform_tax_audit_events
    (actor_issuer,actor_subject,action,resource_type,resource_id,tenant_id,correlation_id,reason,safe_metadata)
  VALUES (p_actor_issuer,p_actor_subject,'TAX_ASSIGNMENT_EVIDENCE_'||p_decision,
          'TAX_ASSIGNMENT_EVIDENCE',p_evidence_id,v_tenant_id,p_correlation_id,p_note,
          jsonb_build_object('assignmentId',v_assignment_id));
  RETURN v_assignment_id;
END
$fn$;

CREATE OR REPLACE FUNCTION public.finance_review_tenant_tax_assignment(
  p_assignment_id uuid, p_decision text, p_reason text, p_actor_issuer text,
  p_actor_subject text, p_correlation_id text
) RETURNS TABLE (assignment_id uuid,status text,reviewed_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
AS $fn$
DECLARE v_tenant_id uuid; v_jurisdiction_id uuid; v_requester_issuer text;
        v_requester_subject text; v_evidence_count integer; v_verified_count integer;
        v_now timestamptz := now();
BEGIN
  SELECT a.tenant_id,a.jurisdiction_id,a.requested_by_issuer,a.requested_by_subject
    INTO v_tenant_id,v_jurisdiction_id,v_requester_issuer,v_requester_subject
    FROM public.finance_tenant_tax_jurisdictions a
   WHERE a.id=p_assignment_id AND a.status='PENDING_REVIEW' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='TAX_ASSIGNMENT_NOT_PENDING'; END IF;
  IF v_requester_issuer=p_actor_issuer AND v_requester_subject=p_actor_subject THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='SELF_REVIEW_NOT_ALLOWED';
  END IF;
  IF NOT public.finance_tax_actor_can(p_actor_issuer,p_actor_subject,'ASSIGNMENT_REVIEW',v_jurisdiction_id) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='TAX_ASSIGNMENT_REVIEW_REQUIRED';
  END IF;
  IF p_decision NOT IN ('APPROVE','REJECT')
     OR (p_decision='REJECT' AND length(btrim(coalesce(p_reason,''))) NOT BETWEEN 10 AND 1000)
     OR (p_reason IS NOT NULL AND length(p_reason)>1000)
     OR p_correlation_id IS NULL OR length(btrim(p_correlation_id)) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_TAX_ASSIGNMENT_DECISION';
  END IF;
  IF p_decision='APPROVE' THEN
    SELECT count(*),count(*) FILTER (WHERE status='VERIFIED')
      INTO v_evidence_count,v_verified_count
      FROM public.finance_tax_assignment_evidence
     WHERE assignment_id=p_assignment_id AND tenant_id=v_tenant_id;
    IF v_evidence_count=0 OR v_evidence_count<>v_verified_count THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='TAX_EVIDENCE_NOT_VERIFIED';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.finance_tax_jurisdictions j WHERE j.id=v_jurisdiction_id AND j.is_active) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='JURISDICTION_REFERENCE_INACTIVE';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.finance_tax_rules r
       WHERE r.jurisdiction_id=v_jurisdiction_id AND r.status='ACTIVE'
         AND r.tenant_id IS NULL AND r.valid_from<=CURRENT_DATE
         AND (r.valid_to IS NULL OR r.valid_to>=CURRENT_DATE)
    ) THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='NO_ACTIVE_GLOBAL_TAX_RULE'; END IF;
    UPDATE public.finance_tenant_tax_jurisdictions
       SET status='ACTIVE',reviewed_by_issuer=p_actor_issuer,reviewed_by_subject=p_actor_subject,
           reviewed_at=v_now,decision_reason=nullif(btrim(p_reason),''),evidence_verified_at=v_now,
           evidence_verified_by_issuer=p_actor_issuer,evidence_verified_by_subject=p_actor_subject,
           activated_at=v_now,updated_at=v_now
     WHERE id=p_assignment_id;
  ELSE
    UPDATE public.finance_tenant_tax_jurisdictions
       SET status='REVOKED',reviewed_by_issuer=p_actor_issuer,reviewed_by_subject=p_actor_subject,
           reviewed_at=v_now,decision_reason=btrim(p_reason),revoked_at=v_now,updated_at=v_now
     WHERE id=p_assignment_id;
  END IF;
  INSERT INTO public.finance_platform_tax_audit_events
    (actor_issuer,actor_subject,action,resource_type,resource_id,tenant_id,correlation_id,reason,safe_metadata)
  VALUES (p_actor_issuer,p_actor_subject,'TAX_ASSIGNMENT_'||p_decision,'TAX_ASSIGNMENT',
          p_assignment_id,v_tenant_id,p_correlation_id,p_reason,jsonb_build_object('jurisdictionId',v_jurisdiction_id));
  RETURN QUERY SELECT a.id,a.status,a.reviewed_at FROM public.finance_tenant_tax_jurisdictions a WHERE a.id=p_assignment_id;
END
$fn$;

CREATE OR REPLACE FUNCTION public.finance_create_platform_tax_delegation(
  p_identity_issuer text,p_identity_subject text,p_jurisdiction_id uuid,p_country_code char(2),
  p_permissions text[],p_valid_from timestamptz,p_valid_to timestamptz,
  p_reason text,p_actor_issuer text,p_actor_subject text,p_correlation_id text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
AS $fn$
DECLARE v_id uuid := gen_random_uuid();
BEGIN
  IF NOT public.finance_is_active_platform_operator(p_actor_issuer,p_actor_subject) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='PLATFORM_OPERATOR_REQUIRED';
  END IF;
  IF (p_jurisdiction_id IS NULL)=(p_country_code IS NULL)
     OR (p_country_code IS NOT NULL AND p_country_code !~ '^[A-Z]{2}$')
     OR cardinality(p_permissions)=0
     OR NOT (p_permissions <@ ARRAY['ASSIGNMENT_REVIEW','EVIDENCE_REVIEW','RULE_REVIEW','JURISDICTION_MANAGE']::text[])
     OR p_valid_from IS NULL OR (p_valid_to IS NOT NULL AND p_valid_to<=p_valid_from)
     OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 10 AND 1000 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_TAX_DELEGATION';
  END IF;
  IF p_jurisdiction_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.finance_tax_jurisdictions WHERE id=p_jurisdiction_id) THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='JURISDICTION_NOT_FOUND';
  END IF;
  IF p_identity_issuer=p_actor_issuer AND p_identity_subject=p_actor_subject THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='SELF_DELEGATION_NOT_ALLOWED';
  END IF;
  INSERT INTO public.finance_platform_tax_delegations
    (id,identity_issuer,identity_subject,jurisdiction_id,country_code,permissions,status,
     valid_from,valid_to,granted_by_issuer,granted_by_subject,reason)
  VALUES (v_id,p_identity_issuer,p_identity_subject,p_jurisdiction_id,p_country_code,p_permissions,
          'ACTIVE',p_valid_from,p_valid_to,p_actor_issuer,p_actor_subject,p_reason);
  INSERT INTO public.finance_platform_tax_audit_events
    (actor_issuer,actor_subject,action,resource_type,resource_id,correlation_id,reason,safe_metadata)
  VALUES (p_actor_issuer,p_actor_subject,'TAX_DELEGATION_GRANTED','TAX_DELEGATION',v_id,
          p_correlation_id,p_reason,jsonb_build_object('permissions',p_permissions,'jurisdictionId',p_jurisdiction_id,'countryCode',p_country_code));
  RETURN v_id;
END
$fn$;

CREATE OR REPLACE FUNCTION public.finance_submit_global_tax_rule_for_approval(
  p_rule_id uuid,p_actor_issuer text,p_actor_subject text,p_correlation_id text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
AS $fn$
DECLARE v_version integer; v_id uuid := gen_random_uuid();
BEGIN
  IF NOT public.finance_is_active_platform_operator(p_actor_issuer,p_actor_subject) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='PLATFORM_OPERATOR_REQUIRED';
  END IF;
  SELECT version INTO v_version FROM public.finance_tax_rules
   WHERE id=p_rule_id AND tenant_id IS NULL AND status='DRAFT' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='GLOBAL_DRAFT_RULE_NOT_FOUND'; END IF;
  INSERT INTO public.finance_tax_rule_approvals
    (id,tax_rule_id,tenant_id,rule_version,status,submitted_by_issuer,submitted_by_subject)
  VALUES (v_id,p_rule_id,NULL,v_version,'PENDING_REVIEW',p_actor_issuer,p_actor_subject);
  INSERT INTO public.finance_platform_tax_audit_events
    (actor_issuer,actor_subject,action,resource_type,resource_id,correlation_id,safe_metadata)
  VALUES (p_actor_issuer,p_actor_subject,'GLOBAL_TAX_RULE_SUBMITTED','TAX_RULE',p_rule_id,
          p_correlation_id,jsonb_build_object('approvalId',v_id,'version',v_version));
  RETURN v_id;
END
$fn$;

CREATE OR REPLACE FUNCTION public.finance_review_global_tax_rule(
  p_approval_id uuid,p_decision text,p_reason text,p_actor_issuer text,
  p_actor_subject text,p_correlation_id text
) RETURNS TABLE (approval_id uuid,rule_id uuid,status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
AS $fn$
DECLARE v_rule_id uuid; v_version integer; v_submitter_issuer text; v_submitter_subject text;
        v_jurisdiction_id uuid; v_now timestamptz := now();
BEGIN
  SELECT a.tax_rule_id,a.rule_version,a.submitted_by_issuer,a.submitted_by_subject
    INTO v_rule_id,v_version,v_submitter_issuer,v_submitter_subject
    FROM public.finance_tax_rule_approvals a
   WHERE a.id=p_approval_id AND a.status='PENDING_REVIEW' AND a.tenant_id IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='TAX_RULE_APPROVAL_NOT_PENDING'; END IF;
  SELECT jurisdiction_id INTO v_jurisdiction_id FROM public.finance_tax_rules
   WHERE id=v_rule_id AND tenant_id IS NULL AND version=v_version AND status='DRAFT' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='GLOBAL_TAX_RULE_VERSION_CHANGED'; END IF;
  IF v_submitter_issuer=p_actor_issuer AND v_submitter_subject=p_actor_subject THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='SELF_REVIEW_NOT_ALLOWED';
  END IF;
  IF NOT public.finance_tax_actor_can(p_actor_issuer,p_actor_subject,'RULE_REVIEW',v_jurisdiction_id) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='TAX_RULE_REVIEW_REQUIRED';
  END IF;
  IF p_decision NOT IN ('APPROVE','REJECT')
     OR (p_decision='REJECT' AND length(btrim(coalesce(p_reason,''))) NOT BETWEEN 10 AND 1000) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_TAX_RULE_DECISION';
  END IF;
  UPDATE public.finance_tax_rule_approvals
     SET status=CASE WHEN p_decision='APPROVE' THEN 'APPROVED' ELSE 'REJECTED' END,
         reviewed_by_issuer=p_actor_issuer,reviewed_by_subject=p_actor_subject,
         reviewed_at=v_now,decision_reason=nullif(btrim(p_reason),'')
   WHERE id=p_approval_id;
  IF p_decision='APPROVE' THEN
    UPDATE public.finance_tax_rules SET status='ACTIVE',updated_at=v_now
     WHERE id=v_rule_id AND tenant_id IS NULL AND version=v_version AND status='DRAFT';
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='GLOBAL_TAX_RULE_VERSION_CHANGED'; END IF;
  END IF;
  INSERT INTO public.finance_platform_tax_audit_events
    (actor_issuer,actor_subject,action,resource_type,resource_id,correlation_id,reason,safe_metadata)
  VALUES (p_actor_issuer,p_actor_subject,'GLOBAL_TAX_RULE_'||p_decision,'TAX_RULE',
          v_rule_id,p_correlation_id,p_reason,jsonb_build_object('approvalId',p_approval_id,'version',v_version));
  RETURN QUERY SELECT p_approval_id,v_rule_id,CASE WHEN p_decision='APPROVE' THEN 'APPROVED' ELSE 'REJECTED' END;
END
$fn$;

-- The evidence bucket is private; uploads/downloads must be proxied by the Finance API.
DO $bucket$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
    VALUES ('zenox-tax-assignment-evidence','zenox-tax-assignment-evidence',false,10485760,
            ARRAY['application/pdf','image/jpeg','image/png']::text[])
    ON CONFLICT (id) DO UPDATE SET public=false,file_size_limit=10485760,
      allowed_mime_types=ARRAY['application/pdf','image/jpeg','image/png']::text[];
  END IF;
END
$bucket$;

-- Function execution is backend-only. Explicit grants are conditional for portable CI.
DO $grants$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'finance_tax_actor_can(text,text,text,uuid)',
    'finance_create_tenant_tax_assignment(uuid,uuid,date,date,text,text,text,text,text,text)',
    'finance_add_tax_assignment_evidence(uuid,uuid,text,text,text,bigint,text,text,text,text,text)',
    'finance_review_tax_assignment_evidence(uuid,text,text,text,text,text)',
    'finance_review_tenant_tax_assignment(uuid,text,text,text,text,text)',
    'finance_create_platform_tax_delegation(text,text,uuid,character,text[],timestamp with time zone,timestamp with time zone,text,text,text,text)',
    'finance_submit_global_tax_rule_for_approval(uuid,text,text,text)',
    'finance_review_global_tax_rule(uuid,text,text,text,text,text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC',f);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
      EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM anon',f);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
      EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM authenticated',f);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role',f);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='finance_runtime') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO finance_runtime',f);
    END IF;
  END LOOP;
END
$grants$;

REVOKE UPDATE,DELETE,TRUNCATE ON public.finance_platform_tax_audit_events FROM PUBLIC;
