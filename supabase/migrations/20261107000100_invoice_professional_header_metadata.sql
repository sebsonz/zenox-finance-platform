-- Lot 1: professional invoice header metadata.
-- Additive and backward-compatible. Finance database only; never run against ZENOX FRET.
ALTER TABLE public.finance_invoices
  ADD COLUMN IF NOT EXISTS purchase_order_reference text,
  ADD COLUMN IF NOT EXISTS service_date date,
  ADD COLUMN IF NOT EXISTS payment_terms text,
  ADD COLUMN IF NOT EXISTS payment_instructions text,
  ADD COLUMN IF NOT EXISTS external_reference text,
  ADD COLUMN IF NOT EXISTS footer_note text;

ALTER TABLE public.finance_invoices
  ADD CONSTRAINT finance_invoices_purchase_order_reference_length
    CHECK (purchase_order_reference IS NULL OR length(purchase_order_reference) <= 120),
  ADD CONSTRAINT finance_invoices_payment_terms_length
    CHECK (payment_terms IS NULL OR length(payment_terms) <= 500),
  ADD CONSTRAINT finance_invoices_payment_instructions_length
    CHECK (payment_instructions IS NULL OR length(payment_instructions) <= 2000),
  ADD CONSTRAINT finance_invoices_external_reference_length
    CHECK (external_reference IS NULL OR length(external_reference) <= 120),
  ADD CONSTRAINT finance_invoices_footer_note_length
    CHECK (footer_note IS NULL OR length(footer_note) <= 1000);
