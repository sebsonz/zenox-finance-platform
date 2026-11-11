-- Full-reversal credit notes. Original issued invoice and artifacts remain untouched.
CREATE TABLE IF NOT EXISTS public.finance_credit_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  original_invoice_id uuid NOT NULL,
  credit_note_code text NOT NULL,
  status text NOT NULL DEFAULT 'ISSUED' CHECK (status = 'ISSUED'),
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 3 AND 2000),
  currency_code char(3) NOT NULL,
  currency_minor_unit smallint NOT NULL CHECK (currency_minor_unit BETWEEN 0 AND 6),
  customer_snapshot jsonb NOT NULL,
  source_tax_snapshot_id uuid NOT NULL,
  source_tax_snapshot_version integer NOT NULL CHECK (source_tax_snapshot_version > 0),
  document_version integer NOT NULL DEFAULT 1 CHECK (document_version = 1),
  lines_snapshot jsonb NOT NULL CHECK (jsonb_typeof(lines_snapshot) = 'array' AND jsonb_array_length(lines_snapshot) > 0),
  subtotal numeric(20,8) NOT NULL CHECK (subtotal >= 0),
  discount_total numeric(20,8) NOT NULL CHECK (discount_total >= 0),
  taxable_total numeric(20,8) NOT NULL CHECK (taxable_total >= 0),
  tax_total numeric(20,8) NOT NULL CHECK (tax_total >= 0),
  grand_total numeric(20,8) NOT NULL CHECK (grand_total >= 0),
  amount_due numeric(20,4) NOT NULL CHECK (amount_due >= 0),
  html_content text NOT NULL CHECK (length(html_content) > 0),
  html_sha256 text NOT NULL CHECK (html_sha256 ~ '^[a-f0-9]{64}$'),
  pdf_content bytea NOT NULL CHECK (octet_length(pdf_content) > 8),
  pdf_sha256 text NOT NULL CHECK (pdf_sha256 ~ '^[a-f0-9]{64}$'),
  issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  issued_by_principal_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT finance_credit_notes_source_uq UNIQUE (tenant_id, original_invoice_id),
  CONSTRAINT finance_credit_notes_code_uq UNIQUE (tenant_id, credit_note_code),
  CONSTRAINT finance_credit_notes_source_fk FOREIGN KEY (tenant_id, original_invoice_id)
    REFERENCES public.finance_invoices (tenant_id, id) ON DELETE RESTRICT
);

ALTER TABLE public.finance_credit_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_credit_notes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS finance_credit_notes_tenant_policy ON public.finance_credit_notes;
CREATE POLICY finance_credit_notes_tenant_policy ON public.finance_credit_notes
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

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
     OR jsonb_array_length(NEW.lines_snapshot) = 0 THEN
    RAISE EXCEPTION 'CREDIT_NOTE_MUST_FULLY_REVERSE_MATCHING_ISSUED_INVOICE' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS finance_credit_note_immutable_guard ON public.finance_credit_notes;
CREATE TRIGGER finance_credit_note_immutable_guard BEFORE INSERT OR UPDATE OR DELETE
  ON public.finance_credit_notes FOR EACH ROW EXECUTE FUNCTION public.finance_guard_credit_note();
REVOKE ALL ON FUNCTION public.finance_guard_credit_note() FROM PUBLIC;
REVOKE ALL ON TABLE public.finance_credit_notes FROM PUBLIC;
DO $grants$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['finance_runtime', 'finance_runtime_test'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('GRANT SELECT, INSERT ON TABLE public.finance_credit_notes TO %I', role_name);
      EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.finance_credit_notes FROM %I', role_name);
    END IF;
  END LOOP;
END;
$grants$;
CREATE INDEX IF NOT EXISTS finance_credit_notes_source_lookup_idx
  ON public.finance_credit_notes (tenant_id, original_invoice_id);
COMMENT ON TABLE public.finance_credit_notes IS
  'Immutable full-reversal credit note preserving the source issued invoice, tax snapshot, line snapshot, HTML and PDF artifacts.';
