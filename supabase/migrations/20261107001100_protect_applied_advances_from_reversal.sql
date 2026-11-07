-- Prevent reversal of a paid advance allocation after that value has been applied to a balance invoice.
CREATE OR REPLACE FUNCTION public.finance_guard_payment_allocation_reversal()
RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE
 allocation_row public.finance_payment_allocations%ROWTYPE;
 already_reversed numeric(24,8);
 payment_id uuid;
 invoice_id uuid;
 invoice_allocated numeric(24,8);
 advance_applied numeric(24,8);
BEGIN
 SELECT * INTO allocation_row FROM public.finance_payment_allocations
  WHERE tenant_id=NEW.tenant_id AND id=NEW.allocation_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ALLOCATION_NOT_FOUND' USING ERRCODE='23503'; END IF;
 SELECT COALESCE(sum(amount),0) INTO already_reversed FROM public.finance_payment_allocation_reversals
  WHERE tenant_id=NEW.tenant_id AND allocation_id=NEW.allocation_id;
 IF NEW.amount>allocation_row.amount-already_reversed THEN
  RAISE EXCEPTION 'ALLOCATION_REVERSAL_EXCEEDED' USING ERRCODE='23514';
 END IF;
 SELECT COALESCE(sum(applied_amount),0) INTO advance_applied FROM public.finance_invoice_relationships
  WHERE tenant_id=NEW.tenant_id AND source_invoice_id=allocation_row.invoice_id;
 SELECT COALESCE(allocated_amount,0) INTO invoice_allocated FROM public.finance_payment_invoice_balances
  WHERE tenant_id=NEW.tenant_id AND invoice_id=allocation_row.invoice_id FOR UPDATE;
 IF invoice_allocated-NEW.amount<advance_applied THEN
  RAISE EXCEPTION 'ADVANCE_ALREADY_APPLIED_CANNOT_REVERSE' USING ERRCODE='23514';
 END IF;
 UPDATE public.finance_payments SET allocated_amount=allocated_amount-NEW.amount,updated_at=clock_timestamp()
  WHERE tenant_id=NEW.tenant_id AND id=allocation_row.payment_id AND allocated_amount>=NEW.amount
  RETURNING id INTO payment_id;
 IF payment_id IS NULL THEN RAISE EXCEPTION 'PAYMENT_BALANCE_INVARIANT' USING ERRCODE='23514'; END IF;
 UPDATE public.finance_payment_invoice_balances AS balance
  SET allocated_amount=balance.allocated_amount-NEW.amount,updated_at=clock_timestamp()
  WHERE balance.tenant_id=NEW.tenant_id AND balance.invoice_id=allocation_row.invoice_id AND balance.allocated_amount>=NEW.amount
  RETURNING balance.invoice_id INTO invoice_id;
 IF invoice_id IS NULL THEN RAISE EXCEPTION 'INVOICE_BALANCE_INVARIANT' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.finance_guard_payment_allocation_reversal() FROM PUBLIC;
