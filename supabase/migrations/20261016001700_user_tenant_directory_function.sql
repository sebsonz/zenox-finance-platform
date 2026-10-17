-- Read-only tenant directory for the authenticated user BFF.
-- Finance database only. Forward-only; never apply to ZENOX FRET.
--
-- The runtime role cannot SELECT the membership control table directly. This
-- narrow SECURITY DEFINER function returns only active tenants linked to the
-- identity context established by the trusted backend for the current
-- transaction. The function takes no identity arguments from the caller.
CREATE OR REPLACE FUNCTION public.finance_list_my_active_tenants()
RETURNS TABLE (id uuid, tenant_code text, legal_name text, role_code text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $function$
  SELECT t.id, t.tenant_code, t.legal_name, m.role_code
    FROM public.finance_user_tenant_memberships AS m
    JOIN public.finance_tenants AS t ON t.id = m.tenant_id
   WHERE m.identity_issuer = NULLIF(current_setting('app.identity_issuer', true), '')
     AND m.identity_subject = NULLIF(current_setting('app.identity_subject', true), '')
     AND m.status = 'ACTIVE'
     AND t.status = 'ACTIVE'
   ORDER BY t.legal_name ASC, t.id ASC
$function$;

REVOKE ALL ON FUNCTION public.finance_list_my_active_tenants() FROM PUBLIC;
-- Deployment provisioning must grant EXECUTE only to the private Finance
-- backend role. CI grants it only to finance_runtime_test on disposable PG.
