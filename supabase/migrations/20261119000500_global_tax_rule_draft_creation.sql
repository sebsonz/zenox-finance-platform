-- Audited creation of global tax-rule drafts and exact-version approval submission.

CREATE OR REPLACE FUNCTION public.finance_platform_create_global_tax_rule_draft(
  p_actor_issuer text,p_actor_subject text,p_rule jsonb,p_reason text,p_correlation_id text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
AS $fn$
DECLARE v_id uuid:=gen_random_uuid(); v_jurisdiction_id uuid; v_version integer;
BEGIN
  IF NOT public.finance_is_active_platform_operator(p_actor_issuer,p_actor_subject) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='PLATFORM_OPERATOR_REQUIRED';
  END IF;
  IF jsonb_typeof(p_rule)<>'object'
     OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 10 AND 1000
     OR length(btrim(coalesce(p_correlation_id,''))) NOT BETWEEN 1 AND 100
     OR length(btrim(coalesce(p_rule->>'ruleCode',''))) NOT BETWEEN 2 AND 80
     OR length(btrim(coalesce(p_rule->>'sourceReference',''))) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_GLOBAL_TAX_RULE_DRAFT';
  END IF;
  v_jurisdiction_id := (p_rule->>'jurisdictionId')::uuid;
  IF NOT EXISTS (SELECT 1 FROM public.finance_tax_jurisdictions WHERE id=v_jurisdiction_id AND is_active) THEN
    RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='JURISDICTION_NOT_ACTIVE';
  END IF;
  -- Serialize version allocation for this jurisdiction/rule code. The
  -- unique constraint remains the final integrity guard, while this transaction-
  -- scoped lock prevents concurrent draft creation from choosing the same version.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_jurisdiction_id::text || ':' || (p_rule->>'ruleCode'), 0)
  );
  SELECT coalesce(max(r.version),0)+1 INTO v_version
    FROM public.finance_tax_rules r
   WHERE r.tenant_id IS NULL AND r.jurisdiction_id=v_jurisdiction_id
     AND r.rule_code=p_rule->>'ruleCode';
  INSERT INTO public.finance_tax_rules
    (id,tenant_id,jurisdiction_id,rule_code,name,tax_type,treatment,rate_percent,
     price_mode,priority,is_compound,applies_to,source_reference,source_url,
     version,valid_from,valid_to,status,accounting_treatment,applicability_conditions)
  VALUES
    (v_id,NULL,v_jurisdiction_id,p_rule->>'ruleCode',p_rule->>'name',
     p_rule->>'taxType',p_rule->>'treatment',(p_rule->>'ratePercent')::numeric,
     coalesce(p_rule->>'priceMode','EXCLUSIVE'),coalesce((p_rule->>'priority')::integer,100),
     coalesce((p_rule->>'isCompound')::boolean,false),coalesce(p_rule->>'appliesTo','GOODS'),
     nullif(p_rule->>'sourceReference',''),nullif(p_rule->>'sourceUrl',''),
     v_version,(p_rule->>'validFrom')::date,nullif(p_rule->>'validTo','')::date,
     'DRAFT',coalesce(p_rule->>'accountingTreatment','TAX_CHARGED'),
     coalesce(p_rule->'applicabilityConditions','{"schemaVersion":1,"all":[]}'::jsonb));
  INSERT INTO public.finance_platform_tax_audit_events
    (actor_issuer,actor_subject,action,resource_type,resource_id,correlation_id,reason,safe_metadata)
  VALUES(p_actor_issuer,p_actor_subject,'GLOBAL_TAX_RULE_DRAFT_CREATED','TAX_RULE',
         v_id,p_correlation_id,p_reason,jsonb_build_object('ruleCode',p_rule->>'ruleCode','version',v_version));
  RETURN v_id;
END
$fn$;

REVOKE ALL ON FUNCTION public.finance_platform_create_global_tax_rule_draft(text,text,jsonb,text,text) FROM PUBLIC;
DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON FUNCTION public.finance_platform_create_global_tax_rule_draft(text,text,jsonb,text,text) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON FUNCTION public.finance_platform_create_global_tax_rule_draft(text,text,jsonb,text,text) FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
    GRANT EXECUTE ON FUNCTION public.finance_platform_create_global_tax_rule_draft(text,text,jsonb,text,text) TO service_role;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='finance_runtime') THEN
    GRANT EXECUTE ON FUNCTION public.finance_platform_create_global_tax_rule_draft(text,text,jsonb,text,text) TO finance_runtime;
  END IF;
END
$grants$;