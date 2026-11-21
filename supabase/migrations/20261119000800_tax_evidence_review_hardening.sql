-- Harden tax evidence review: uploader/requester separation, single transition and audit correlation.
-- Finance database only. Review and test before applying to any Supabase environment.

CREATE OR REPLACE FUNCTION public.finance_review_tax_assignment_evidence(
  p_evidence_id uuid, p_decision text, p_note text, p_actor_issuer text,
  p_actor_subject text, p_correlation_id text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
AS $fn$
DECLARE
  v_assignment_id uuid;
  v_tenant_id uuid;
  v_jurisdiction_id uuid;
  v_uploader_issuer text;
  v_uploader_subject text;
  v_requester_issuer text;
  v_requester_subject text;
BEGIN
  SELECT e.assignment_id,e.tenant_id,a.jurisdiction_id,
         e.uploaded_by_issuer,e.uploaded_by_subject,
         a.requested_by_issuer,a.requested_by_subject
    INTO v_assignment_id,v_tenant_id,v_jurisdiction_id,
         v_uploader_issuer,v_uploader_subject,
         v_requester_issuer,v_requester_subject
    FROM public.finance_tax_assignment_evidence e
    JOIN public.finance_tenant_tax_jurisdictions a
      ON a.id=e.assignment_id AND a.tenant_id=e.tenant_id
   WHERE e.id=p_evidence_id
     AND e.status='UPLOADED'
   FOR UPDATE OF e,a;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='TAX_EVIDENCE_NOT_PENDING_REVIEW';
  END IF;

  IF (v_uploader_issuer=p_actor_issuer AND v_uploader_subject=p_actor_subject)
     OR (v_requester_issuer=p_actor_issuer AND v_requester_subject=p_actor_subject) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='SELF_REVIEW_NOT_ALLOWED';
  END IF;

  IF NOT public.finance_tax_actor_can(
    p_actor_issuer,p_actor_subject,'EVIDENCE_REVIEW',v_jurisdiction_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='TAX_EVIDENCE_REVIEW_REQUIRED';
  END IF;

  IF p_decision NOT IN ('VERIFY','REJECT')
     OR (p_decision='REJECT' AND length(btrim(coalesce(p_note,''))) NOT BETWEEN 10 AND 1000)
     OR (p_note IS NOT NULL AND length(btrim(p_note))>1000)
     OR p_correlation_id IS NULL
     OR length(btrim(p_correlation_id)) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_TAX_EVIDENCE_DECISION';
  END IF;

  UPDATE public.finance_tax_assignment_evidence
     SET status=CASE WHEN p_decision='VERIFY' THEN 'VERIFIED' ELSE 'REJECTED' END,
         reviewed_at=now(),
         reviewed_by_issuer=p_actor_issuer,
         reviewed_by_subject=p_actor_subject,
         review_note=nullif(btrim(p_note),''),
         updated_at=now()
   WHERE id=p_evidence_id AND status='UPLOADED';

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='TAX_EVIDENCE_REVIEW_STATE_CHANGED';
  END IF;

  INSERT INTO public.finance_platform_tax_audit_events
    (actor_issuer,actor_subject,action,resource_type,resource_id,tenant_id,
     correlation_id,reason,safe_metadata)
  VALUES
    (p_actor_issuer,p_actor_subject,'TAX_ASSIGNMENT_EVIDENCE_'||p_decision,
     'TAX_ASSIGNMENT_EVIDENCE',p_evidence_id,v_tenant_id,p_correlation_id,p_note,
     jsonb_build_object('assignmentId',v_assignment_id));

  RETURN v_assignment_id;
END
$fn$;

REVOKE ALL ON FUNCTION public.finance_review_tax_assignment_evidence(uuid,text,text,text,text,text) FROM PUBLIC;
DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON FUNCTION public.finance_review_tax_assignment_evidence(uuid,text,text,text,text,text) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON FUNCTION public.finance_review_tax_assignment_evidence(uuid,text,text,text,text,text) FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
    GRANT EXECUTE ON FUNCTION public.finance_review_tax_assignment_evidence(uuid,text,text,text,text,text) TO service_role;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='finance_runtime') THEN
    GRANT EXECUTE ON FUNCTION public.finance_review_tax_assignment_evidence(uuid,text,text,text,text,text) TO finance_runtime;
  END IF;
END
$grants$;
