-- ZENOX Finance tax administration read and jurisdiction-management APIs.
-- All platform writes require an active platform operator and an audit reason.

CREATE OR REPLACE FUNCTION public.finance_list_platform_tax_assignments(
  p_actor_issuer text,p_actor_subject text,p_status text DEFAULT NULL,
  p_country_code char(2) DEFAULT NULL,p_limit integer DEFAULT 50,p_offset integer DEFAULT 0
) RETURNS TABLE (
  id uuid,tenant_id uuid,tenant_code text,tenant_name text,jurisdiction_id uuid,
  jurisdiction_code text,jurisdiction_name text,country_code char(2),status text,
  valid_from date,valid_to date,initiated_by text,requested_by_issuer text,
  requested_by_subject text,reviewed_at timestamptz,decision_reason text,created_at timestamptz,
  evidence_count bigint,verified_evidence_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public
AS $fn$
BEGIN
  IF NOT public.finance_is_active_platform_operator(p_actor_issuer,p_actor_subject)
     AND NOT EXISTS (
       SELECT 1 FROM public.finance_platform_tax_delegations d
        WHERE d.identity_issuer=p_actor_issuer AND d.identity_subject=p_actor_subject
          AND d.status='ACTIVE' AND d.valid_from<=now() AND (d.valid_to IS NULL OR d.valid_to>now())
          AND 'ASSIGNMENT_REVIEW'=ANY(d.permissions)
     ) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='TAX_ASSIGNMENT_LIST_REQUIRED'; END IF;
  IF p_limit NOT BETWEEN 1 AND 100 OR p_offset<0 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_TAX_ASSIGNMENT_PAGINATION';
  END IF;
  RETURN QUERY
  SELECT a.id,a.tenant_id,t.tenant_code,t.legal_name,a.jurisdiction_id,j.code,j.name,j.country_code,
         a.status,a.valid_from,a.valid_to,a.initiated_by,a.requested_by_issuer,a.requested_by_subject,
         a.reviewed_at,a.decision_reason,a.created_at,
         count(e.id),count(e.id) FILTER (WHERE e.status='VERIFIED')
    FROM public.finance_tenant_tax_jurisdictions a
    JOIN public.finance_tenants t ON t.id=a.tenant_id
    JOIN public.finance_tax_jurisdictions j ON j.id=a.jurisdiction_id
    LEFT JOIN public.finance_tax_assignment_evidence e ON e.assignment_id=a.id AND e.tenant_id=a.tenant_id
   WHERE (p_status IS NULL OR a.status=p_status)
     AND (p_country_code IS NULL OR j.country_code=p_country_code)
     AND (public.finance_is_active_platform_operator(p_actor_issuer,p_actor_subject)
       OR EXISTS (
         SELECT 1 FROM public.finance_platform_tax_delegations d
          WHERE d.identity_issuer=p_actor_issuer AND d.identity_subject=p_actor_subject
            AND d.status='ACTIVE' AND d.valid_from<=now() AND (d.valid_to IS NULL OR d.valid_to>now())
            AND 'ASSIGNMENT_REVIEW'=ANY(d.permissions)
            AND (d.jurisdiction_id=j.id OR d.country_code=j.country_code)
       ))
   GROUP BY a.id,t.tenant_code,t.legal_name,j.code,j.name,j.country_code
   ORDER BY a.created_at DESC,a.id
   LIMIT p_limit OFFSET p_offset;
END
$fn$;

CREATE OR REPLACE FUNCTION public.finance_list_tenant_tax_assignments(
  p_tenant_id uuid,p_actor_issuer text,p_actor_subject text
) RETURNS TABLE (
  id uuid,jurisdiction_id uuid,jurisdiction_code text,jurisdiction_name text,
  country_code char(2),status text,valid_from date,valid_to date,basis_type text,
  basis_reference text,initiated_by text,reviewed_at timestamptz,decision_reason text,created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public
AS $fn$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.finance_user_tenant_memberships m
     WHERE m.tenant_id=p_tenant_id AND m.identity_issuer=p_actor_issuer
       AND m.identity_subject=p_actor_subject AND m.status='ACTIVE'
  ) AND NOT public.finance_is_active_platform_operator(p_actor_issuer,p_actor_subject) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='TENANT_ACCESS_DENIED';
  END IF;
  RETURN QUERY
  SELECT a.id,a.jurisdiction_id,j.code,j.name,j.country_code,a.status,a.valid_from,a.valid_to,
         a.basis_type,a.basis_reference,a.initiated_by,a.reviewed_at,a.decision_reason,a.created_at
    FROM public.finance_tenant_tax_jurisdictions a
    JOIN public.finance_tax_jurisdictions j ON j.id=a.jurisdiction_id
   WHERE a.tenant_id=p_tenant_id
   ORDER BY a.created_at DESC,a.id;
END
$fn$;

CREATE OR REPLACE FUNCTION public.finance_list_tax_assignment_evidence(
  p_assignment_id uuid,p_actor_issuer text,p_actor_subject text
) RETURNS TABLE (
  id uuid,tenant_id uuid,document_type text,original_filename text,content_type text,
  byte_size bigint,sha256 char(64),status text,review_note text,created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public
AS $fn$
DECLARE v_tenant_id uuid; v_jurisdiction_id uuid;
BEGIN
  SELECT tenant_id,jurisdiction_id INTO v_tenant_id,v_jurisdiction_id
    FROM public.finance_tenant_tax_jurisdictions WHERE id=p_assignment_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='TAX_ASSIGNMENT_NOT_FOUND'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.finance_user_tenant_memberships m
     WHERE m.tenant_id=v_tenant_id AND m.identity_issuer=p_actor_issuer
       AND m.identity_subject=p_actor_subject AND m.status='ACTIVE'
  ) AND NOT public.finance_tax_actor_can(p_actor_issuer,p_actor_subject,'EVIDENCE_REVIEW',v_jurisdiction_id) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='TAX_EVIDENCE_ACCESS_DENIED';
  END IF;
  RETURN QUERY
  SELECT e.id,e.tenant_id,e.document_type,e.original_filename,e.content_type,e.byte_size,
         e.sha256,e.status,e.review_note,e.created_at
    FROM public.finance_tax_assignment_evidence e
   WHERE e.assignment_id=p_assignment_id AND e.tenant_id=v_tenant_id
     AND e.status<>'REMOVED'
   ORDER BY e.created_at,e.id;
END
$fn$;

CREATE OR REPLACE FUNCTION public.finance_platform_upsert_tax_jurisdiction_level(
  p_country_code char(2),p_level_code text,p_label text,p_parent_level_code text,
  p_sort_order integer,p_is_required boolean,p_is_active boolean,
  p_actor_issuer text,p_actor_subject text,p_reason text,p_correlation_id text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
AS $fn$
DECLARE v_id uuid;
BEGIN
  IF NOT public.finance_is_active_platform_operator(p_actor_issuer,p_actor_subject)
     AND NOT EXISTS (
       SELECT 1 FROM public.finance_platform_tax_delegations d
        WHERE d.identity_issuer=p_actor_issuer AND d.identity_subject=p_actor_subject
          AND d.status='ACTIVE' AND d.valid_from<=now() AND (d.valid_to IS NULL OR d.valid_to>now())
          AND 'JURISDICTION_MANAGE'=ANY(d.permissions)
          AND (d.country_code=p_country_code OR d.jurisdiction_id IN
            (SELECT j.id FROM public.finance_tax_jurisdictions j WHERE j.country_code=p_country_code))
     ) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='JURISDICTION_MANAGE_REQUIRED'; END IF;
  IF p_country_code !~ '^[A-Z]{2}$' OR p_level_code !~ '^[A-Z][A-Z0-9_]{1,39}$'
     OR length(btrim(coalesce(p_label,''))) NOT BETWEEN 1 AND 100
     OR p_sort_order NOT BETWEEN 0 AND 10000
     OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 10 AND 1000 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_JURISDICTION_LEVEL';
  END IF;
  IF p_parent_level_code IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.finance_tax_jurisdiction_levels
     WHERE country_code=p_country_code AND level_code=p_parent_level_code AND is_active
  ) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PARENT_JURISDICTION_LEVEL_NOT_FOUND'; END IF;
  INSERT INTO public.finance_tax_jurisdiction_levels
    (country_code,level_code,label,parent_level_code,sort_order,is_required,is_active)
  VALUES (p_country_code,p_level_code,p_label,p_parent_level_code,p_sort_order,p_is_required,p_is_active)
  ON CONFLICT (country_code,level_code) DO UPDATE SET
    label=EXCLUDED.label,parent_level_code=EXCLUDED.parent_level_code,
    sort_order=EXCLUDED.sort_order,is_required=EXCLUDED.is_required,
    is_active=EXCLUDED.is_active,updated_at=now()
  RETURNING id INTO v_id;
  INSERT INTO public.finance_platform_tax_audit_events
    (actor_issuer,actor_subject,action,resource_type,resource_id,correlation_id,reason,safe_metadata)
  VALUES (p_actor_issuer,p_actor_subject,'TAX_JURISDICTION_LEVEL_UPSERTED',
          'TAX_JURISDICTION_LEVEL',v_id,p_correlation_id,p_reason,
          jsonb_build_object('countryCode',p_country_code,'levelCode',p_level_code));
  RETURN v_id;
END
$fn$;

CREATE OR REPLACE FUNCTION public.finance_platform_upsert_tax_jurisdiction(
  p_id uuid,p_code text,p_country_code char(2),p_name text,p_level_code text,
  p_parent_id uuid,p_is_active boolean,p_actor_issuer text,p_actor_subject text,
  p_reason text,p_correlation_id text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
AS $fn$
DECLARE v_id uuid := coalesce(p_id,gen_random_uuid()); v_parent_country char(2);
BEGIN
  IF NOT public.finance_is_active_platform_operator(p_actor_issuer,p_actor_subject)
     AND NOT public.finance_tax_actor_can(p_actor_issuer,p_actor_subject,'JURISDICTION_MANAGE',coalesce(p_id,p_parent_id)) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='JURISDICTION_MANAGE_REQUIRED';
  END IF;
  IF p_code !~ '^[A-Z0-9][A-Z0-9_.:-]{1,79}$' OR p_country_code !~ '^[A-Z]{2}$'
     OR length(btrim(coalesce(p_name,''))) NOT BETWEEN 1 AND 160
     OR p_level_code !~ '^[A-Z][A-Z0-9_]{1,39}$'
     OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 10 AND 1000 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_TAX_JURISDICTION';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.finance_tax_jurisdiction_levels
    WHERE country_code=p_country_code AND level_code=p_level_code AND is_active) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='JURISDICTION_LEVEL_NOT_CONFIGURED';
  END IF;
  IF p_parent_id IS NOT NULL THEN
    SELECT country_code INTO v_parent_country FROM public.finance_tax_jurisdictions WHERE id=p_parent_id;
    IF NOT FOUND OR v_parent_country<>p_country_code OR p_parent_id=v_id THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_JURISDICTION_PARENT';
    END IF;
  END IF;
  IF p_id IS NOT NULL THEN
    UPDATE public.finance_tax_jurisdictions SET code=p_code,country_code=p_country_code,
      name=p_name,jurisdiction_level=p_level_code,parent_id=p_parent_id,
      is_active=p_is_active,updated_at=now() WHERE id=p_id;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='JURISDICTION_NOT_FOUND'; END IF;
  ELSE
    INSERT INTO public.finance_tax_jurisdictions(id,code,country_code,name,jurisdiction_level,parent_id,is_active)
    VALUES(v_id,p_code,p_country_code,p_name,p_level_code,p_parent_id,p_is_active);
  END IF;
  INSERT INTO public.finance_platform_tax_audit_events
    (actor_issuer,actor_subject,action,resource_type,resource_id,correlation_id,reason,safe_metadata)
  VALUES(p_actor_issuer,p_actor_subject,'TAX_JURISDICTION_UPSERTED','TAX_JURISDICTION',
         v_id,p_correlation_id,p_reason,jsonb_build_object('code',p_code,'countryCode',p_country_code,'level',p_level_code));
  RETURN v_id;
END
$fn$;

CREATE OR REPLACE FUNCTION public.finance_list_platform_tax_delegations(
  p_actor_issuer text,p_actor_subject text
) RETURNS TABLE (
  id uuid,identity_issuer text,identity_subject text,jurisdiction_id uuid,
  country_code char(2),permissions text[],status text,valid_from timestamptz,
  valid_to timestamptz,granted_by_issuer text,granted_by_subject text,reason text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public
AS $fn$
BEGIN
  IF NOT public.finance_is_active_platform_operator(p_actor_issuer,p_actor_subject) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='PLATFORM_OPERATOR_REQUIRED';
  END IF;
  RETURN QUERY SELECT d.id,d.identity_issuer,d.identity_subject,d.jurisdiction_id,d.country_code,
    d.permissions,d.status,d.valid_from,d.valid_to,d.granted_by_issuer,d.granted_by_subject,d.reason
    FROM public.finance_platform_tax_delegations d ORDER BY d.created_at DESC,d.id;
END
$fn$;

CREATE OR REPLACE FUNCTION public.finance_revoke_platform_tax_delegation(
  p_delegation_id uuid,p_reason text,p_actor_issuer text,p_actor_subject text,p_correlation_id text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
AS $fn$
BEGIN
  IF NOT public.finance_is_active_platform_operator(p_actor_issuer,p_actor_subject) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='PLATFORM_OPERATOR_REQUIRED';
  END IF;
  IF length(btrim(coalesce(p_reason,''))) NOT BETWEEN 10 AND 1000 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='REVOCATION_REASON_REQUIRED';
  END IF;
  UPDATE public.finance_platform_tax_delegations SET status='REVOKED',updated_at=now()
   WHERE id=p_delegation_id AND status='ACTIVE';
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO public.finance_platform_tax_audit_events
    (actor_issuer,actor_subject,action,resource_type,resource_id,correlation_id,reason)
  VALUES(p_actor_issuer,p_actor_subject,'TAX_DELEGATION_REVOKED','TAX_DELEGATION',
         p_delegation_id,p_correlation_id,p_reason);
  RETURN true;
END
$fn$;

-- Keep platform tax audit append-only and grant only function execution.
REVOKE UPDATE,DELETE,TRUNCATE ON public.finance_platform_tax_audit_events FROM PUBLIC;
DO $grants$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'finance_list_platform_tax_assignments(text,text,text,character,integer,integer)',
    'finance_list_tenant_tax_assignments(uuid,text,text)',
    'finance_list_tax_assignment_evidence(uuid,text,text)',
    'finance_platform_upsert_tax_jurisdiction_level(character,text,text,text,integer,boolean,boolean,text,text,text,text)',
    'finance_platform_upsert_tax_jurisdiction(uuid,text,character,text,text,uuid,boolean,text,text,text,text)',
    'finance_list_platform_tax_delegations(text,text)',
    'finance_revoke_platform_tax_delegation(uuid,text,text,text,text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC',f);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM anon',f); END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM authenticated',f); END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role',f); END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='finance_runtime') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO finance_runtime',f); END IF;
  END LOOP;
END
$grants$;
