-- Treat paid advances applied to a balance invoice as settlement offsets.
CREATE OR REPLACE FUNCTION public.finance_guard_payment_allocation()
RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE
 payment_row public.finance_payments%ROWTYPE;
 invoice_row public.finance_invoices%ROWTYPE;
 allocated_payment_id uuid;
 allocated_invoice_id uuid;
 advance_applied numeric(24,8);
 net_invoice_total numeric(24,8);
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
 IF NEW.amount<>round(NEW.amount,invoice_row.currency_minor_unit) THEN RAISE EXCEPTION 'AMOUNT_PRECISION_INVALID' USING ERRCODE='23514'; END IF;
 SELECT COALESCE(sum(applied_amount),0) INTO advance_applied FROM public.finance_invoice_relationships
  WHERE tenant_id=NEW.tenant_id AND related_invoice_id=NEW.invoice_id;
 net_invoice_total:=invoice_row.grand_total-advance_applied;
 IF net_invoice_total<=0 THEN RAISE EXCEPTION 'INVOICE_BALANCE_EXCEEDED' USING ERRCODE='23514'; END IF;
 UPDATE public.finance_payments SET allocated_amount=allocated_amount+NEW.amount,updated_at=clock_timestamp()
  WHERE tenant_id=NEW.tenant_id AND id=NEW.payment_id
    AND amount-allocated_amount-refund_reserved_amount>=NEW.amount
  RETURNING id INTO allocated_payment_id;
 IF allocated_payment_id IS NULL THEN RAISE EXCEPTION 'PAYMENT_AMOUNT_EXCEEDED' USING ERRCODE='23514'; END IF;
 INSERT INTO public.finance_payment_invoice_balances(tenant_id,invoice_id,invoice_total,allocated_amount)
 VALUES(NEW.tenant_id,NEW.invoice_id,net_invoice_total,NEW.amount)
 ON CONFLICT(tenant_id,invoice_id) DO UPDATE
  SET allocated_amount=finance_payment_invoice_balances.allocated_amount+EXCLUDED.allocated_amount,updated_at=clock_timestamp()
  WHERE finance_payment_invoice_balances.invoice_total=EXCLUDED.invoice_total
    AND finance_payment_invoice_balances.invoice_total-finance_payment_invoice_balances.allocated_amount>=EXCLUDED.allocated_amount
 RETURNING invoice_id INTO allocated_invoice_id;
 IF allocated_invoice_id IS NULL THEN RAISE EXCEPTION 'INVOICE_BALANCE_EXCEEDED' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.finance_guard_payment_allocation() FROM PUBLIC;
