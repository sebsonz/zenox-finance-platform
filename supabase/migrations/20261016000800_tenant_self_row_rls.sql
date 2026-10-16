-- Permit a backend transaction to read only the tenant row selected by
-- its validated transaction-local context. Finance database only; never run
-- against ZENOX FRET.
--
-- Membership authorization must succeed before the application opens this
-- tenant-scoped read. FORCE RLS remains enabled.
DROP POLICY IF EXISTS finance_tenant_self_row_select
  ON public.finance_tenants;

CREATE POLICY finance_tenant_self_row_select
  ON public.finance_tenants
  FOR SELECT
  USING (
    id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );

-- This policy grants no table privileges; deployment grants remain explicit.
