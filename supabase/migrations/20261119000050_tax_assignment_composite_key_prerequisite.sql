-- Prerequisite for the tax administration foundation migration.
-- The historical tenant assignment table is created by 20261108000400.
-- Add the composite candidate key before migration 20261119000100 creates
-- evidence rows with a tenant-scoped foreign key to (id, tenant_id).
-- This migration is intentionally idempotent and does not alter existing rows.

DO $constraint$
BEGIN
  IF to_regclass('public.finance_tenant_tax_jurisdictions') IS NULL THEN
    RAISE EXCEPTION
      'finance_tenant_tax_jurisdictions must exist before tax assignment reconciliation';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.finance_tenant_tax_jurisdictions'::regclass
       AND conname = 'finance_tenant_tax_jurisdictions_id_tenant_key'
  ) THEN
    ALTER TABLE public.finance_tenant_tax_jurisdictions
      ADD CONSTRAINT finance_tenant_tax_jurisdictions_id_tenant_key
      UNIQUE (id, tenant_id);
  END IF;
END
$constraint$;
