-- Immutable, tenant-scoped evidence for tax decisions used by financial documents.
-- Intentionally no FK to invoices: Finance document lifecycle is introduced separately.
CREATE TABLE IF NOT EXISTS public.finance_tax_calculation_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.finance_tenants(id) ON DELETE RESTRICT,
  document_type text NOT NULL CHECK (document_type IN (
    'INVOICE', 'CREDIT_NOTE', 'DEBIT_NOTE', 'RECEIPT', 'OTHER'
  )),
  document_id uuid NOT NULL,
  document_version integer NOT NULL CHECK (document_version > 0),
  calculation_policy text NOT NULL CHECK (length(btrim(calculation_policy)) > 0),
  engine_version text NOT NULL CHECK (length(btrim(engine_version)) > 0),
  tax_date date NOT NULL,
  currency_code char(3) NOT NULL REFERENCES public.finance_currencies(code) ON DELETE RESTRICT,
  currency_minor_unit smallint NOT NULL CHECK (currency_minor_unit BETWEEN 0 AND 4),
  jurisdiction_id uuid REFERENCES public.finance_tax_jurisdictions(id) ON DELETE RESTRICT,
  input_snapshot jsonb NOT NULL CHECK (jsonb_typeof(input_snapshot) = 'object'),
  result_snapshot jsonb NOT NULL CHECK (jsonb_typeof(result_snapshot) = 'object'),
  applied_rules_snapshot jsonb NOT NULL CHECK (jsonb_typeof(applied_rules_snapshot) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  CONSTRAINT finance_tax_calculation_snapshots_document_version_uq
    UNIQUE (tenant_id, document_type, document_id, document_version)
);

CREATE INDEX IF NOT EXISTS finance_tax_snapshots_document_idx
  ON public.finance_tax_calculation_snapshots
    (tenant_id, document_type, document_id, document_version DESC);

CREATE INDEX IF NOT EXISTS finance_tax_snapshots_created_idx
  ON public.finance_tax_calculation_snapshots (tenant_id, created_at DESC);

ALTER TABLE public.finance_tax_calculation_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_tax_calculation_snapshots FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS finance_tax_snapshots_tenant_select
  ON public.finance_tax_calculation_snapshots;
CREATE POLICY finance_tax_snapshots_tenant_select
  ON public.finance_tax_calculation_snapshots
  FOR SELECT
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );

DROP POLICY IF EXISTS finance_tax_snapshots_tenant_insert
  ON public.finance_tax_calculation_snapshots;
CREATE POLICY finance_tax_snapshots_tenant_insert
  ON public.finance_tax_calculation_snapshots
  FOR INSERT
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );

-- These records are evidence of a calculation at a point in time, not mutable state.
CREATE OR REPLACE FUNCTION public.finance_reject_tax_snapshot_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Tax calculation snapshots are immutable'
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS finance_tax_snapshots_immutable
  ON public.finance_tax_calculation_snapshots;
CREATE TRIGGER finance_tax_snapshots_immutable
  BEFORE UPDATE OR DELETE ON public.finance_tax_calculation_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.finance_reject_tax_snapshot_mutation();

REVOKE ALL ON TABLE public.finance_tax_calculation_snapshots FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finance_reject_tax_snapshot_mutation() FROM PUBLIC;

COMMENT ON TABLE public.finance_tax_calculation_snapshots IS
  'Immutable tenant-scoped evidence of tax inputs, outputs, and applied rule versions for a financial document.';
COMMENT ON COLUMN public.finance_tax_calculation_snapshots.applied_rules_snapshot IS
  'Ordered immutable copy of each applied rule and source metadata; not a live reference to mutable tax rules.';
