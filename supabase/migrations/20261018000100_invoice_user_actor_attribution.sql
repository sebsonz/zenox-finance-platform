-- Finance-only forward migration. Never apply to ZENOX FRET databases.
-- Human users must not be represented by integration-principal identifiers.
ALTER TABLE public.finance_invoices
  ADD COLUMN IF NOT EXISTS created_by_actor_type text,
  ADD COLUMN IF NOT EXISTS created_by_actor_ref text,
  ADD COLUMN IF NOT EXISTS issued_by_actor_type text,
  ADD COLUMN IF NOT EXISTS issued_by_actor_ref text;

ALTER TABLE public.finance_invoices
  DROP CONSTRAINT IF EXISTS finance_invoices_created_by_actor_type_check,
  DROP CONSTRAINT IF EXISTS finance_invoices_issued_by_actor_type_check;

ALTER TABLE public.finance_invoices
  ADD CONSTRAINT finance_invoices_created_by_actor_type_check
    CHECK (created_by_actor_type IS NULL OR created_by_actor_type IN ('USER', 'SERVICE', 'SYSTEM')),
  ADD CONSTRAINT finance_invoices_issued_by_actor_type_check
    CHECK (issued_by_actor_type IS NULL OR issued_by_actor_type IN ('USER', 'SERVICE', 'SYSTEM'));

-- Legacy columns continue to record service principal IDs when the operation
-- originates from an integration. User operations write only actor_type/ref.
-- The old columns may be NULL so that user actions are never misattributed.
ALTER TABLE public.finance_invoices
  ALTER COLUMN created_by_principal_id DROP NOT NULL,
  ALTER COLUMN issued_by_principal_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS finance_invoices_created_actor_idx
  ON public.finance_invoices (tenant_id, created_by_actor_type, created_by_actor_ref);
CREATE INDEX IF NOT EXISTS finance_invoices_issued_actor_idx
  ON public.finance_invoices (tenant_id, issued_by_actor_type, issued_by_actor_ref);

COMMENT ON COLUMN public.finance_invoices.created_by_actor_ref IS
  'Stable actor reference; for USER this is issuer|subject and is not an integration principal ID.';
COMMENT ON COLUMN public.finance_invoices.issued_by_actor_ref IS
  'Stable actor reference; for USER this is issuer|subject and is not an integration principal ID.';
