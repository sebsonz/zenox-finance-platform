-- Link invoice draft revisions to immutable tax evidence.
-- Additive Finance-only migration. Never apply to ZENOX FRET.
-- Earlier migrations are intentionally unchanged so their checksums remain stable.

ALTER TABLE public.finance_invoices
  ADD COLUMN IF NOT EXISTS document_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS tax_snapshot_id uuid,
  ADD COLUMN IF NOT EXISTS tax_snapshot_version integer,
  ADD COLUMN IF NOT EXISTS tax_status text NOT NULL DEFAULT 'PROVISIONAL';

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

ALTER TABLE public.finance_invoices
  DROP CONSTRAINT IF EXISTS finance_invoices_tax_snapshot_fk;
ALTER TABLE public.finance_invoices
  ADD CONSTRAINT finance_invoices_tax_snapshot_fk
  FOREIGN KEY (tenant_id, tax_snapshot_id)
  REFERENCES public.finance_tax_calculation_snapshots(tenant_id, id)
  ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS finance_invoices_tax_snapshot_idx
  ON public.finance_invoices (tenant_id, tax_snapshot_id)
  WHERE tax_snapshot_id IS NOT NULL;

-- A snapshot is immutable even for the table owner. Use a uniquely named
-- function so we do not replace or mutate the existing immutable-snapshot API.
CREATE OR REPLACE FUNCTION public.finance_reject_tax_snapshot_binding_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'TAX_CALCULATION_SNAPSHOT_IMMUTABLE'
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS finance_tax_snapshot_binding_immutable
  ON public.finance_tax_calculation_snapshots;
CREATE TRIGGER finance_tax_snapshot_binding_immutable
  BEFORE UPDATE OR DELETE ON public.finance_tax_calculation_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.finance_reject_tax_snapshot_binding_mutation();

REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.finance_tax_calculation_snapshots FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finance_reject_tax_snapshot_binding_mutation() FROM PUBLIC;

COMMENT ON COLUMN public.finance_invoices.document_version IS
  'Monotonically increasing revision of the mutable draft; snapshots bind to this revision.';
COMMENT ON COLUMN public.finance_invoices.tax_status IS
  'PROVISIONAL means invoice line tax rates are user supplied; CALCULATED means an immutable Finance tax snapshot is attached; REVIEW_REQUIRED means rule composition requires review.';
