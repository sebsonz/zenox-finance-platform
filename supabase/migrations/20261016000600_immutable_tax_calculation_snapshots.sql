-- Bind each invoice draft revision to an immutable Finance tax-calculation snapshot.
-- Additive migration; do not edit older applied migration files.
-- Finance database only. Never apply to ZENOX FRET.

ALTER TABLE public.finance_invoices
  ADD COLUMN IF NOT EXISTS tax_snapshot_id uuid,
  ADD COLUMN IF NOT EXISTS tax_snapshot_version integer,
  ADD COLUMN IF NOT EXISTS tax_status text NOT NULL DEFAULT 'PROVISIONAL'
    CHECK (tax_status IN ('PROVISIONAL', 'CALCULATED', 'REVIEW_REQUIRED'));

ALTER TABLE public.finance_invoices
  DROP CONSTRAINT IF EXISTS finance_invoices_tax_snapshot_version_ck;
ALTER TABLE public.finance_invoices
  ADD CONSTRAINT finance_invoices_tax_snapshot_version_ck
  CHECK (tax_snapshot_version IS NULL OR tax_snapshot_version > 0);

ALTER TABLE public.finance_invoices
  DROP CONSTRAINT IF EXISTS finance_invoices_tax_snapshot_pair_ck;
ALTER TABLE public.finance_invoices
  ADD CONSTRAINT finance_invoices_tax_snapshot_pair_ck
  CHECK ((tax_snapshot_id IS NULL) = (tax_snapshot_version IS NULL));

ALTER TABLE public.finance_tax_calculation_snapshots
  ADD CONSTRAINT finance_tax_snapshots_tenant_id_id_uq UNIQUE (tenant_id, id);

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

COMMENT ON COLUMN public.finance_invoices.tax_status IS
  'PROVISIONAL means line draft tax rates are user-supplied and not authoritative; CALCULATED means a matching immutable tax snapshot has been attached; REVIEW_REQUIRED means no safe rule composition was available.';
COMMENT ON COLUMN public.finance_invoices.tax_snapshot_id IS
  'Immutable tax-calculation evidence associated with this invoice draft version. Snapshot tenant, document ID, document version and currency must match the invoice.';

-- A snapshot is evidence for a specific immutable document revision, and cannot
-- be updated or removed after insertion.
CREATE OR REPLACE FUNCTION public.finance_reject_tax_snapshot_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'TAX_CALCULATION_SNAPSHOT_IMMUTABLE'
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS finance_tax_snapshot_immutable
  ON public.finance_tax_calculation_snapshots;
CREATE TRIGGER finance_tax_snapshot_immutable
  BEFORE UPDATE OR DELETE ON public.finance_tax_calculation_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.finance_reject_tax_snapshot_mutation();

REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.finance_tax_calculation_snapshots FROM PUBLIC;
