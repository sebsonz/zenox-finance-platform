-- Treat paid advances applied to a balance invoice as settlement offsets.
CREATE OR REPLACE FUNCTION public.finance_guard_payment_allocation()
RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE
 payment_row public.finance_payments%ROWTYPE;
 invoice_row public.finance_invoices%ROWTYPE;
 payment_allocated numeric(24,8);
 payment_reversed numeric(24,8);
 invoice_allocated numeric(24,8);
 invoice_reversed numeric(24,8);
 advance_applied numeric(24,8);
BEGIN
 SELECT * INTO payment_row FROM public.finance_payments WHERE tenant_id=NEW.tenant_id AND id=NEW.payment_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_NOT_FOUND' USING ERRCODE='23503'; END IF;
 SELECT * INTO invoice_row FROM public.finance_invoices WHERE tenant_id=NEW.tenant_id AND id=NEW.invoice_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'INVOICE_NOT_FOUND' USING ERRCODE='23503'; END IF;
 IF payment_row.status NOT IN ('CONFIRMED','SETTLED') THEN RAISE EXCEPTION 'PAYMENT_NOT_CONFIRMED' USING ERRCODE='23514'; END IF;
 IF invoice_row.status<>'ISSUED' THEN RAISE EXCEPTION 'INVOICE_NOT_ISSUED' USING ERRCODE='23514'; END IF;
 IF btrim(payment_row.currency_code)<>btrim(invoice_row.currency_code) OR btrim(NEW.currency_code)<>btrim(payment_row.currency_code) THEN
  RAISE EXCEPTION 'PAYMENT_CURRENCY_MISMATCH' USING ERRCODE='23514';
 END IF;
 SELECT COALESCE(sum(amount),0) INTO payment_allocated FROM public.finance_payment_allocations WHERE tenant_id=NEW.tenant_id AND payment_id=NEW.payment_id;
 SELECT COALESCE(sum(r.amount),0) INTO payment_reversed FROM public.finance_payment_allocation_reversals r JOIN public.finance_payment_allocations a
  ON a.tenant_id=r.tenant_id AND a.id=r.allocation_id WHERE r.tenant_id=NEW.tenant_id AND a.payment_id=NEW.payment_id;
 SELECT COALESCE(sum(amount),0) INTO invoice_allocated FROM public.finance_payment_allocations WHERE tenant_id=NEW.tenant_id AND invoice_id=NEW.invoice_id;
 SELECT COALESCE(sum(r.amount),0) INTO invoice_reversed FROM public.finance_payment_allocation_reversals r JOIN public.finance_payment_allocations a
  ON a.tenant_id=r.tenant_id AND a.id=r.allocation_id WHERE r.tenant_id=NEW.tenant_id AND a.invoice_id=NEW.invoice_id;
 SELECT COALESCE(sum(applied_amount),0) INTO advance_applied FROM public.finance_invoice_relationships
  WHERE tenant_id=NEW.tenant_id AND related_invoice_id=NEW.invoice_id;
 IF NEW.amount>payment_row.amount-payment_allocated+payment_reversed THEN RAISE EXCEPTION 'PAYMENT_AMOUNT_EXCEEDED' USING ERRCODE='23514'; END IF;
 IF NEW.amount>invoice_row.grand_total-advance_applied-invoice_allocated+invoice_reversed THEN
  RAISE EXCEPTION 'INVOICE_BALANCE_EXCEEDED' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.finance_guard_payment_allocation() FROM PUBLIC;
