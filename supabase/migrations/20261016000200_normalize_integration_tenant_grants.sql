-- Normalize integration principal tenant grants and establish the private control-plane boundary.
-- This migration is Finance-only. Transaction boundaries are handled by scripts/migrate.ts.

CREATE TABLE IF NOT EXISTS public.finance_integration_tenant_grants (
  principal_id uuid NOT NULL
    REFERENCES public.finance_integration_principals(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL
    REFERENCES public.finance_tenants(id) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL DEFAULT now(),
  granted_by text,
  PRIMARY KEY (principal_id, tenant_id)
);

-- Preserve existing grants when upgrading a database that already ran migration 001.
INSERT INTO public.finance_integration_tenant_grants (principal_id, tenant_id)
SELECT p.id, grant_row.tenant_id
  FROM public.finance_integration_principals AS p
 CROSS JOIN LATERAL unnest(p.allowed_tenant_ids) AS grant_row(tenant_id)
ON CONFLICT (principal_id, tenant_id) DO NOTHING;

ALTER TABLE public.finance_integration_principals
  DROP COLUMN IF EXISTS allowed_tenant_ids;

CREATE INDEX IF NOT EXISTS finance_integration_tenant_grants_tenant_idx
  ON public.finance_integration_tenant_grants (tenant_id, principal_id);

-- These are backend-only control-plane tables, not tenant business data.
-- Keep normal table privileges restricted to the table owner / explicitly
-- granted backend database role. Tenant business tables will retain FORCE RLS.
-- FORCE RLS on these three tables prevents the SECURITY boundary of a private
-- backend DB connection from being useful unless every lookup has a tenant
-- policy before authentication has established the tenant. Therefore remove
-- RLS from the minimal control-plane lookup tables and restrict SQL privileges.
ALTER TABLE public.finance_tenants NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.finance_tenants DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_integration_principals NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.finance_integration_principals DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_integration_tenant_grants NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.finance_integration_tenant_grants DISABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.finance_tenants,
  public.finance_integration_principals,
  public.finance_integration_tenant_grants
FROM PUBLIC;

-- The app's backend database role must be granted SELECT on these control-plane
-- tables by deployment provisioning. Do not grant these tables to browser roles.
