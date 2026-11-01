-- Audited organization lifecycle controls for ZENOX Finance platform operators.
-- Finance database only. Never apply this migration to ZENOX FRET V2.
-- This migration is authored for review; it must not be applied without approval.

CREATE OR REPLACE FUNCTION public.finance_platform_set_organization_status(
  p_operator_issuer text,
  p_operator_subject text,
  p_tenant_id uuid,
  p_action text,
  p_reason text,
  p_correlation_id text
)
RETURNS TABLE (
  tenant_id uuid,
  status text,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_current_status text;
  v_next_status text;
  v_reason text;
  v_updated_at timestamptz;
BEGIN
  IF NOT public.finance_is_active_platform_operator(p_operator_issuer, p_operator_subject) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PLATFORM_OPERATOR_REQUIRED';
  END IF;

  IF p_tenant_id IS NULL OR p_action NOT IN ('SUSPEND', 'REACTIVATE') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_ORGANIZATION_ACTION';
  END IF;

  v_reason := btrim(coalesce(p_reason, ''));
  IF length(v_reason) NOT BETWEEN 10 AND 1000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ACTION_REASON_REQUIRED';
  END IF;
  IF p_correlation_id IS NULL OR length(btrim(p_correlation_id)) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_CORRELATION_ID';
  END IF;

  SELECT t.status
    INTO v_current_status
    FROM public.finance_tenants AS t
   WHERE t.id = p_tenant_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'ORGANIZATION_NOT_FOUND';
  END IF;

  IF p_action = 'SUSPEND' AND v_current_status = 'ACTIVE' THEN
    v_next_status := 'SUSPENDED';
  ELSIF p_action = 'REACTIVATE' AND v_current_status = 'SUSPENDED' THEN
    v_next_status := 'ACTIVE';
  ELSE
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ORGANIZATION_STATUS_TRANSITION_NOT_ALLOWED';
  END IF;

  UPDATE public.finance_tenants
     SET status = v_next_status,
         updated_at = now()
   WHERE id = p_tenant_id
   RETURNING finance_tenants.updated_at INTO v_updated_at;

  INSERT INTO public.finance_audit_events
    (tenant_id, actor_type, actor_ref, action, resource_type, resource_id,
     correlation_id, safe_metadata)
  VALUES
    (p_tenant_id, 'USER', p_operator_issuer || '|' || p_operator_subject,
     CASE WHEN p_action = 'SUSPEND'
       THEN 'PLATFORM_ORGANIZATION_SUSPENDED'
       ELSE 'PLATFORM_ORGANIZATION_REACTIVATED'
     END,
     'ORGANIZATION', p_tenant_id, p_correlation_id,
     jsonb_build_object(
       'previousStatus', v_current_status,
       'newStatus', v_next_status,
       'reason', v_reason
     ));

  RETURN QUERY SELECT p_tenant_id, v_next_status, v_updated_at;
END;
$function$;

REVOKE ALL ON FUNCTION public.finance_platform_set_organization_status(text, text, uuid, text, text, text) FROM PUBLIC;

DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.finance_platform_set_organization_status(text, text, uuid, text, text, text) TO service_role;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finance_runtime') THEN
    GRANT EXECUTE ON FUNCTION public.finance_platform_set_organization_status(text, text, uuid, text, text, text) TO finance_runtime;
  END IF;
END
$grants$;

COMMENT ON FUNCTION public.finance_platform_set_organization_status(text, text, uuid, text, text, text) IS
  'Suspends or reactivates an organization for an active platform operator; requires a reason and writes a tenant-scoped audit event.';
