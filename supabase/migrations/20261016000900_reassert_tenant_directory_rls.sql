-- Reassert tenant-directory row-level security as a forward-only hardening migration.
-- Finance database only; never run against ZENOX FRET.
-- This is intentionally idempotent and does not grant any table privileges.

ALTER TABLE public.finance_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_tenants FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS finance_tenant_self_row_select
  ON public.finance_tenants;

CREATE POLICY finance_tenant_self_row_select
  ON public.finance_tenants
  FOR SELECT
  USING (
    id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );
