-- Finance-only forward migration. Never apply to ZENOX FRET databases.
-- Human users must not be represented by integration-principal identifiers.
ALTER TABLE public.finance_invoices
  ADD COLUMN IF NOT EXISTS created_by_actor_type text,
  ADD COLUMN IF NOT EXISTS created_by_actor_ref text,
  ADD COLUMN IF NOT EXISTS issued_by_actor_type text,
  ADD COLUMN IF NOT EXISTS issued_by_actor_ref text,
  ADD COLUMN IF NOT EXISTS updated_by_actor_type text,
  ADD COLUMN IF NOT EXISTS updated_by_actor_ref text;

ALTER TABLE public.finance_invoices
  DROP CONSTRAINT IF EXISTS finance_invoices_created_by_actor_type_check,
  DROP CONSTRAINT IF EXISTS finance_invoices_issued_by_actor_type_check,
  DROP CONSTRAINT IF EXISTS finance_invoices_updated_by_actor_type_check;

ALTER TABLE public.finance_invoices
  ADD CONSTRAINT finance_invoices_created_by_actor_type_check
    CHECK (created_by_actor_type IS NULL OR created_by_actor_type IN ('USER', 'SERVICE', 'SYSTEM')),
  ADD CONSTRAINT finance_invoices_issued_by_actor_type_check
    CHECK (issued_by_actor_type IS NULL OR issued_by_actor_type IN ('USER', 'SERVICE', 'SYSTEM')),
  ADD CONSTRAINT finance_invoices_updated_by_actor_type_check
    CHECK (updated_by_actor_type IS NULL OR updated_by_actor_type IN ('USER', 'SERVICE', 'SYSTEM'));

-- Legacy columns continue to record service principal IDs when the operation
-- originates from an integration. User operations write only actor_type/ref.
-- The old columns may be NULL so that user actions are never misattributed.
ALTER TABLE public.finance_invoices
  ALTER COLUMN created_by_principal_id DROP NOT NULL,
  ALTER COLUMN issued_by_principal_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS finance_invoices_created_actor_idx
  ON public.finance_invoices (tenant_id, created_by_actor_type, created_by_actor_ref);
CREATE INDEX IF NOT EXISTS finance_invoices_updated_actor_idx
  ON public.finance_invoices (tenant_id, updated_by_actor_type, updated_by_actor_ref);
CREATE INDEX IF NOT EXISTS finance_invoices_issued_actor_idx
  ON public.finance_invoices (tenant_id, issued_by_actor_type, issued_by_actor_ref);

COMMENT ON COLUMN public.finance_invoices.created_by_actor_ref IS
  'Stable actor reference; for USER this is issuer|subject and is not an integration principal ID.';
COMMENT ON COLUMN public.finance_invoices.issued_by_actor_ref IS
  'Stable actor reference; for USER this is issuer|subject and is not an integration principal ID.';

-- Artifact attribution must follow the same actor model; never invent an integration principal.
ALTER TABLE public.finance_invoice_document_artifacts
  ADD COLUMN IF NOT EXISTS created_by_actor_type text,
  ADD COLUMN IF NOT EXISTS created_by_actor_ref text,
  ALTER COLUMN created_by_principal_id DROP NOT NULL;
ALTER TABLE public.finance_invoice_pdf_artifacts
  ADD COLUMN IF NOT EXISTS created_by_actor_type text,
  ADD COLUMN IF NOT EXISTS created_by_actor_ref text,
  ALTER COLUMN created_by_principal_id DROP NOT NULL;

ALTER TABLE public.finance_invoice_document_artifacts
  DROP CONSTRAINT IF EXISTS finance_invoice_document_artifacts_created_by_actor_type_check;
ALTER TABLE public.finance_invoice_document_artifacts
  ADD CONSTRAINT finance_invoice_document_artifacts_created_by_actor_type_check
    CHECK (created_by_actor_type IS NULL OR created_by_actor_type IN ('USER', 'SERVICE', 'SYSTEM'));
ALTER TABLE public.finance_invoice_pdf_artifacts
  DROP CONSTRAINT IF EXISTS finance_invoice_pdf_artifacts_created_by_actor_type_check;
ALTER TABLE public.finance_invoice_pdf_artifacts
  ADD CONSTRAINT finance_invoice_pdf_artifacts_created_by_actor_type_check
    CHECK (created_by_actor_type IS NULL OR created_by_actor_type IN ('USER', 'SERVICE', 'SYSTEM'));

CREATE OR REPLACE FUNCTION public.finance_guard_issued_invoice_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('ISSUED', 'CANCELLED') THEN
      RAISE EXCEPTION 'ISSUED_INVOICE_IMMUTABLE' USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status IN ('ISSUED', 'CANCELLED') THEN
    RAISE EXCEPTION 'ISSUED_INVOICE_IMMUTABLE' USING ERRCODE = '55000';
  END IF;

  IF OLD.status <> NEW.status AND NOT (OLD.status = 'DRAFT' AND NEW.status = 'ISSUED') THEN
    RAISE EXCEPTION 'INVALID_INVOICE_STATUS_TRANSITION' USING ERRCODE = '23514';
  END IF;

  IF OLD.status = 'DRAFT' AND NEW.status = 'ISSUED'
     AND (NEW.tax_status IS DISTINCT FROM 'CALCULATED' OR NEW.tax_snapshot_id IS NULL
          OR (NEW.issued_by_principal_id IS NULL
              AND (NEW.issued_by_actor_type IS NULL OR NEW.issued_by_actor_ref IS NULL))) THEN
    RAISE EXCEPTION 'INVOICE_ISSUANCE_REQUIRES_TAX_SNAPSHOT_AND_ISSUER' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON COLUMN public.finance_invoice_document_artifacts.created_by_actor_ref IS
  'Stable actor reference; for USER this is issuer|subject and not an integration principal ID.';
COMMENT ON COLUMN public.finance_invoice_pdf_artifacts.created_by_actor_ref IS
  'Stable actor reference; for USER this is issuer|subject and not an integration principal ID.';

-- Credit notes also require truthful attribution when issued by a signed-in user.
ALTER TABLE public.finance_credit_notes
  ADD COLUMN IF NOT EXISTS issued_by_actor_type text,
  ADD COLUMN IF NOT EXISTS issued_by_actor_ref text,
  ALTER COLUMN issued_by_principal_id DROP NOT NULL;
ALTER TABLE public.finance_credit_notes
  DROP CONSTRAINT IF EXISTS finance_credit_notes_issued_by_actor_type_check;
ALTER TABLE public.finance_credit_notes
  ADD CONSTRAINT finance_credit_notes_issued_by_actor_type_check
    CHECK (issued_by_actor_type IS NULL OR issued_by_actor_type IN ('USER', 'SERVICE', 'SYSTEM'));

CREATE OR REPLACE FUNCTION public.finance_guard_credit_note()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $function$
DECLARE source_invoice public.finance_invoices%ROWTYPE;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'ISSUED_CREDIT_NOTE_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  SELECT * INTO source_invoice FROM public.finance_invoices
   WHERE tenant_id = NEW.tenant_id AND id = NEW.original_invoice_id;
  IF NOT FOUND OR source_invoice.status <> 'ISSUED'
     OR source_invoice.tax_status <> 'CALCULATED'
     OR source_invoice.tax_snapshot_id IS DISTINCT FROM NEW.source_tax_snapshot_id
     OR source_invoice.tax_snapshot_version IS DISTINCT FROM NEW.source_tax_snapshot_version
     OR source_invoice.currency_code <> NEW.currency_code
     OR source_invoice.subtotal <> NEW.subtotal
     OR source_invoice.discount_total <> NEW.discount_total
     OR source_invoice.taxable_total <> NEW.taxable_total
     OR source_invoice.tax_total <> NEW.tax_total
     OR source_invoice.grand_total <> NEW.grand_total
     OR source_invoice.amount_due <> NEW.amount_due
     OR jsonb_array_length(NEW.lines_snapshot) = 0
     OR (NEW.issued_by_principal_id IS NULL
         AND (NEW.issued_by_actor_type IS NULL OR NEW.issued_by_actor_ref IS NULL)) THEN
    RAISE EXCEPTION 'CREDIT_NOTE_MUST_FULLY_REVERSE_MATCHING_ISSUED_INVOICE' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE INDEX IF NOT EXISTS finance_credit_notes_issued_actor_idx
  ON public.finance_credit_notes (tenant_id, issued_by_actor_type, issued_by_actor_ref);
COMMENT ON COLUMN public.finance_credit_notes.issued_by_actor_ref IS
  'Stable actor reference; for USER this is issuer|subject and not an integration principal ID.';
