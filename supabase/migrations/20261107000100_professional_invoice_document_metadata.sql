-- Professional invoice metadata and line descriptors. Finance-only additive migration.
-- Existing issued invoices and artifacts remain unchanged. Never apply to ZENOX FRET.
ALTER TABLE public.finance_invoices ADD COLUMN IF NOT EXISTS document_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.finance_invoices ADD CONSTRAINT finance_invoices_document_metadata_object CHECK (jsonb_typeof(document_metadata) = 'object') NOT VALID;
ALTER TABLE public.finance_invoices VALIDATE CONSTRAINT finance_invoices_document_metadata_object;
ALTER TABLE public.finance_invoice_lines
  ADD COLUMN IF NOT EXISTS item_code text,
  ADD COLUMN IF NOT EXISTS unit_label text,
  ADD COLUMN IF NOT EXISTS line_note text,
  ADD COLUMN IF NOT EXISTS service_period_start date,
  ADD COLUMN IF NOT EXISTS service_period_end date;
ALTER TABLE public.finance_invoice_lines
  ADD CONSTRAINT finance_invoice_lines_item_code_length CHECK (item_code IS NULL OR length(item_code) <= 100) NOT VALID,
  ADD CONSTRAINT finance_invoice_lines_unit_label_length CHECK (unit_label IS NULL OR length(unit_label) <= 40) NOT VALID,
  ADD CONSTRAINT finance_invoice_lines_line_note_length CHECK (line_note IS NULL OR length(line_note) <= 1000) NOT VALID,
  ADD CONSTRAINT finance_invoice_lines_service_period_valid CHECK (service_period_end IS NULL OR service_period_start IS NULL OR service_period_end >= service_period_start) NOT VALID;
ALTER TABLE public.finance_invoice_lines VALIDATE CONSTRAINT finance_invoice_lines_item_code_length;
ALTER TABLE public.finance_invoice_lines VALIDATE CONSTRAINT finance_invoice_lines_unit_label_length;
ALTER TABLE public.finance_invoice_lines VALIDATE CONSTRAINT finance_invoice_lines_line_note_length;
ALTER TABLE public.finance_invoice_lines VALIDATE CONSTRAINT finance_invoice_lines_service_period_valid;
COMMENT ON COLUMN public.finance_invoices.document_metadata IS 'Customer-facing references, purchase order, contract, payment terms/method, delivery/service dates, language and footer; immutable after issue.';
COMMENT ON COLUMN public.finance_invoice_lines.item_code IS 'Optional SKU or service reference.';
COMMENT ON COLUMN public.finance_invoice_lines.unit_label IS 'Billing unit such as hour, day, item or kg.';
COMMENT ON COLUMN public.finance_invoice_lines.line_note IS 'Additional customer-facing line detail.';
