-- Allow multiple immutable partial credit notes while preventing cumulative over-crediting.
-- Existing full-reversal notes remain valid and unchanged.
ALTER TABLE public.finance_credit_notes
  ADD COLUMN IF NOT EXISTS credit_kind text NOT NULL DEFAULT 'FULL'
  CHECK (credit_kind IN ('FULL', 'PARTIAL'));

ALTER TABLE public.finance_credit_notes
  DROP CONSTRAINT IF EXISTS finance_credit_notes_source_uq;

CREATE INDEX IF NOT EXISTS finance_credit_notes_source_lookup_idx
  ON public.finance_credit_notes (tenant_id, original_invoice_id, issued_at DESC);

CREATE OR REPLACE FUNCTION public.finance_guard_credit_note()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $function$
DECLARE
  source_invoice public.finance_invoices%ROWTYPE;
  already_credited record;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'ISSUED_CREDIT_NOTE_IMMUTABLE' USING ERRCODE = '55000';
  END IF;

  SELECT * INTO source_invoice
    FROM public.finance_invoices
   WHERE tenant_id = NEW.tenant_id AND id = NEW.original_invoice_id
   FOR UPDATE;

  IF NOT FOUND OR source_invoice.status <> 'ISSUED'
     OR source_invoice.tax_status <> 'CALCULATED'
     OR source_invoice.tax_snapshot_id IS DISTINCT FROM NEW.source_tax_snapshot_id
     OR source_invoice.tax_snapshot_version IS DISTINCT FROM NEW.source_tax_snapshot_version
     OR source_invoice.currency_code <> NEW.currency_code
     OR jsonb_array_length(NEW.lines_snapshot) = 0
     OR NEW.subtotal > source_invoice.subtotal
     OR NEW.discount_total > source_invoice.discount_total
     OR NEW.taxable_total > source_invoice.taxable_total
     OR NEW.tax_total > source_invoice.tax_total
     OR NEW.grand_total > source_invoice.grand_total
     OR NEW.amount_due > source_invoice.amount_due THEN
    RAISE EXCEPTION 'CREDIT_NOTE_EXCEEDS_OR_DOES_NOT_MATCH_ISSUED_INVOICE' USING ERRCODE = '23514';
  END IF;

  SELECT
    COALESCE(SUM(subtotal), 0) AS subtotal,
    COALESCE(SUM(discount_total), 0) AS discount_total,
    COALESCE(SUM(taxable_total), 0) AS taxable_total,
    COALESCE(SUM(tax_total), 0) AS tax_total,
    COALESCE(SUM(grand_total), 0) AS grand_total,
    COALESCE(SUM(amount_due), 0) AS amount_due
  INTO already_credited
  FROM public.finance_credit_notes
  WHERE tenant_id = NEW.tenant_id AND original_invoice_id = NEW.original_invoice_id;

  IF already_credited.subtotal + NEW.subtotal > source_invoice.subtotal
     OR already_credited.discount_total + NEW.discount_total > source_invoice.discount_total
     OR already_credited.taxable_total + NEW.taxable_total > source_invoice.taxable_total
     OR already_credited.tax_total + NEW.tax_total > source_invoice.tax_total
     OR already_credited.grand_total + NEW.grand_total > source_invoice.grand_total
     OR already_credited.amount_due + NEW.amount_due > source_invoice.amount_due THEN
    RAISE EXCEPTION 'CREDIT_NOTE_CUMULATIVE_AMOUNT_EXCEEDED' USING ERRCODE = '23514';
  END IF;

  IF NEW.credit_kind = 'FULL' AND (
       already_credited.grand_total <> 0
       OR NEW.subtotal <> source_invoice.subtotal
       OR NEW.discount_total <> source_invoice.discount_total
       OR NEW.taxable_total <> source_invoice.taxable_total
       OR NEW.tax_total <> source_invoice.tax_total
       OR NEW.grand_total <> source_invoice.grand_total
       OR NEW.amount_due <> source_invoice.amount_due
     ) THEN
    RAISE EXCEPTION 'FULL_CREDIT_NOTE_MUST_REVERSE_REMAINING_INVOICE' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.finance_guard_credit_note() FROM PUBLIC;
COMMENT ON TABLE public.finance_credit_notes IS
  'Immutable full or partial credit notes. Multiple notes may reference one issued invoice; a row-locking trigger prevents cumulative credits from exceeding the source invoice.';
