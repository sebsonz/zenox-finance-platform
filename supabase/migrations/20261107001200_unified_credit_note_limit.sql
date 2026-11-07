-- Keep legacy full-reversal credit notes within the same cumulative credit ceiling as partial notes.
CREATE OR REPLACE FUNCTION public.finance_guard_credit_note()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $function$
DECLARE source_invoice public.finance_invoices%ROWTYPE; prior_partial_credits numeric(24,8);
BEGIN
 IF TG_OP<>'INSERT' THEN
  RAISE EXCEPTION 'ISSUED_CREDIT_NOTE_IMMUTABLE' USING ERRCODE='55000';
 END IF;
 SELECT * INTO source_invoice FROM public.finance_invoices
  WHERE tenant_id=NEW.tenant_id AND id=NEW.original_invoice_id FOR UPDATE;
 IF NOT FOUND OR source_invoice.status<>'ISSUED'
   OR source_invoice.tax_status<>'CALCULATED'
   OR source_invoice.tax_snapshot_id IS DISTINCT FROM NEW.source_tax_snapshot_id
   OR source_invoice.tax_snapshot_version IS DISTINCT FROM NEW.source_tax_snapshot_version
   OR source_invoice.currency_code<>NEW.currency_code
   OR source_invoice.subtotal<>NEW.subtotal
   OR source_invoice.discount_total<>NEW.discount_total
   OR source_invoice.taxable_total<>NEW.taxable_total
   OR source_invoice.tax_total<>NEW.tax_total
   OR source_invoice.grand_total<>NEW.grand_total
   OR source_invoice.amount_due<>NEW.amount_due
   OR jsonb_array_length(NEW.lines_snapshot)=0 THEN
  RAISE EXCEPTION 'CREDIT_NOTE_MUST_FULLY_REVERSE_MATCHING_ISSUED_INVOICE' USING ERRCODE='23514';
 END IF;
 SELECT COALESCE(sum(grand_total),0) INTO prior_partial_credits
 FROM public.finance_invoice_adjustments
 WHERE tenant_id=NEW.tenant_id AND original_invoice_id=NEW.original_invoice_id AND adjustment_type='CREDIT_NOTE';
 IF prior_partial_credits+NEW.grand_total>source_invoice.grand_total THEN
  RAISE EXCEPTION 'CREDIT_NOTE_EXCEEDS_REMAINING_INVOICE_VALUE' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.finance_guard_credit_note() FROM PUBLIC;
