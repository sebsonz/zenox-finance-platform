-- Link invoice draft revisions to immutable tax evidence.
-- Additive Finance-only migration. Never apply to ZENOX FRET.
-- Earlier migrations are intentionally unchanged so their checksums remain stable.

ALTER TABLE public.finance_invoices
  ADD COLUMN IF NOT EXISTS document_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS tax_snapshot_id uuid,
  ADD COLUMN IF NOT EXISTS tax_snapshot_version integer,
  ADD COLUMN IF NOT EXISTS tax_status text NOT NULL DEFAULT 'PROVISIONAL',
  ADD COLUMN IF NOT EXISTS amount_due numeric(20, 4);

UPDATE public.finance_invoices
   SET amount_due = grand_total
 WHERE amount_due IS NULL;

ALTER TABLE public.finance_invoices
  ALTER COLUMN amount_due SET DEFAULT 0,
  ALTER COLUMN amount_due SET NOT NULL;

DO $constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'finance_invoices_document_version_ck'
       AND conrelid = 'public.finance_invoices'::regclass
  ) THEN
    ALTER TABLE public.finance_invoices
      ADD CONSTRAINT finance_invoices_document_version_ck
      CHECK (document_version > 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'finance_invoices_tax_status_ck'
       AND conrelid = 'public.finance_invoices'::regclass
  ) THEN
    ALTER TABLE public.finance_invoices
      ADD CONSTRAINT finance_invoices_tax_status_ck
      CHECK (tax_status IN ('PROVISIONAL', 'CALCULATED', 'REVIEW_REQUIRED'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'finance_invoices_tax_snapshot_version_ck'
       AND conrelid = 'public.finance_invoices'::regclass
  ) THEN
    ALTER TABLE public.finance_invoices
      ADD CONSTRAINT finance_invoices_tax_snapshot_version_ck
      CHECK (tax_snapshot_version IS NULL OR tax_snapshot_version > 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'finance_invoices_tax_snapshot_version_match_ck'
       AND conrelid = 'public.finance_invoices'::regclass
  ) THEN
    ALTER TABLE public.finance_invoices
      ADD CONSTRAINT finance_invoices_tax_snapshot_version_match_ck
      CHECK (tax_snapshot_id IS NULL OR tax_snapshot_version = document_version);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'finance_invoices_tax_snapshot_pair_ck'
       AND conrelid = 'public.finance_invoices'::regclass
  ) THEN
    ALTER TABLE public.finance_invoices
      ADD CONSTRAINT finance_invoices_tax_snapshot_pair_ck
      CHECK ((tax_snapshot_id IS NULL) = (tax_snapshot_version IS NULL));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'finance_tax_snapshots_tenant_id_id_uq'
       AND conrelid = 'public.finance_tax_calculation_snapshots'::regclass
  ) THEN
    ALTER TABLE public.finance_tax_calculation_snapshots
      ADD CONSTRAINT finance_tax_snapshots_tenant_id_id_uq UNIQUE (tenant_id, id);
  END IF;
END;
$constraints$;

DO $snapshot_key$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'finance_tax_snapshots_tenant_document_version_id_uq'
       AND conrelid = 'public.finance_tax_calculation_snapshots'::regclass
  ) THEN
    ALTER TABLE public.finance_tax_calculation_snapshots
      ADD CONSTRAINT finance_tax_snapshots_tenant_document_version_id_uq
      UNIQUE (tenant_id, document_id, document_version, id);
  END IF;
END;
$snapshot_key$;

ALTER TABLE public.finance_invoices
  DROP CONSTRAINT IF EXISTS finance_invoices_tax_snapshot_fk;
ALTER TABLE public.finance_invoices
  ADD CONSTRAINT finance_invoices_tax_snapshot_fk
  FOREIGN KEY (tenant_id, id, document_version, tax_snapshot_id)
  REFERENCES public.finance_tax_calculation_snapshots(tenant_id, document_id, document_version, id)
  ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION public.finance_validate_invoice_tax_snapshot_link()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.tax_snapshot_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.tax_snapshot_version IS DISTINCT FROM NEW.document_version THEN
    RAISE EXCEPTION 'TAX_SNAPSHOT_REVISION_MISMATCH' USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.finance_tax_calculation_snapshots s
     WHERE s.id = NEW.tax_snapshot_id
       AND s.tenant_id = NEW.tenant_id
       AND s.document_type = 'INVOICE'
       AND s.document_id = NEW.id
       AND s.document_version = NEW.document_version
  ) THEN
    RAISE EXCEPTION 'TAX_SNAPSHOT_DOCUMENT_MISMATCH' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS finance_invoice_tax_snapshot_link_guard ON public.finance_invoices;
CREATE TRIGGER finance_invoice_tax_snapshot_link_guard
  BEFORE INSERT OR UPDATE OF tax_snapshot_id, tax_snapshot_version, document_version, tenant_id, id
  ON public.finance_invoices
  FOR EACH ROW EXECUTE FUNCTION public.finance_validate_invoice_tax_snapshot_link();

REVOKE ALL ON FUNCTION public.finance_validate_invoice_tax_snapshot_link() FROM PUBLIC;

CREATE INDEX IF NOT EXISTS finance_invoices_tax_snapshot_idx
  ON public.finance_invoices (tenant_id, tax_snapshot_id)
  WHERE tax_snapshot_id IS NOT NULL;

REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.finance_tax_calculation_snapshots FROM PUBLIC;

COMMENT ON COLUMN public.finance_invoices.document_version IS
  'Monotonically increasing revision of the mutable draft; snapshots bind to this revision.';
COMMENT ON COLUMN public.finance_invoices.tax_status IS
  'PROVISIONAL means invoice line tax rates are user supplied; CALCULATED means an immutable Finance tax snapshot is attached; REVIEW_REQUIRED means rule composition requires review.';
COMMENT ON COLUMN public.finance_invoices.amount_due IS
  'Net amount payable after withholding; grand_total remains the gross invoice total.';
