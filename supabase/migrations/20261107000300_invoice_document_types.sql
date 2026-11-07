-- Additive invoice document classification for ZENOX Finance only.
-- Existing invoices remain STANDARD; issued snapshots and artifacts are untouched.

ALTER TABLE public.finance_invoices
  ADD COLUMN IF NOT EXISTS document_type text NOT NULL DEFAULT 'STANDARD',
  ADD COLUMN IF NOT EXISTS contract_total numeric(24, 8),
  ADD COLUMN IF NOT EXISTS related_invoice_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'finance_invoices_document_type_check'
       AND conrelid = 'public.finance_invoices'::regclass
  ) THEN
    ALTER TABLE public.finance_invoices
      ADD CONSTRAINT finance_invoices_document_type_check
      CHECK (document_type IN ('STANDARD', 'DEPOSIT', 'BALANCE')) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'finance_invoices_document_type_fields_check'
       AND conrelid = 'public.finance_invoices'::regclass
  ) THEN
    ALTER TABLE public.finance_invoices
      ADD CONSTRAINT finance_invoices_document_type_fields_check
      CHECK (
        (document_type = 'STANDARD' AND contract_total IS NULL AND related_invoice_id IS NULL)
        OR (document_type = 'DEPOSIT' AND contract_total IS NOT NULL AND contract_total > 0 AND related_invoice_id IS NULL)
        OR (document_type = 'BALANCE' AND contract_total IS NULL AND related_invoice_id IS NOT NULL)
      ) NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'finance_invoices_related_invoice_fk'
       AND conrelid = 'public.finance_invoices'::regclass
  ) THEN
    ALTER TABLE public.finance_invoices
      ADD CONSTRAINT finance_invoices_related_invoice_fk
      FOREIGN KEY (tenant_id, related_invoice_id)
      REFERENCES public.finance_invoices (tenant_id, id)
      ON DELETE RESTRICT NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS finance_invoices_related_invoice_idx
  ON public.finance_invoices (tenant_id, related_invoice_id)
  WHERE related_invoice_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS finance_invoices_one_balance_per_deposit_idx
  ON public.finance_invoices (tenant_id, related_invoice_id)
  WHERE document_type = 'BALANCE' AND status <> 'CANCELLED';

ALTER TABLE public.finance_invoices
  VALIDATE CONSTRAINT finance_invoices_document_type_check;
ALTER TABLE public.finance_invoices
  VALIDATE CONSTRAINT finance_invoices_document_type_fields_check;
ALTER TABLE public.finance_invoices
  VALIDATE CONSTRAINT finance_invoices_related_invoice_fk;
