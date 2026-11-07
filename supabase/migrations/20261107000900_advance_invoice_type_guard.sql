-- Enforce advance-to-balance classification at the database boundary and adjust atomic receivable counters.
ALTER TABLE public.finance_payment_invoice_balances DROP CONSTRAINT IF EXISTS finance_payment_invoice_balances_invoice_total_check;
ALTER TABLE public.finance_payment_invoice_balances ADD CONSTRAINT finance_payment_invoice_balances_invoice_total_check CHECK (invoice_total>=0);
CREATE OR REPLACE FUNCTION public.finance_guard_invoice_relationship()
RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE a public.finance_invoices%ROWTYPE; b public.finance_invoices%ROWTYPE; allocated numeric(24,8); already_applied numeric(24,8); balance_allocated numeric(24,8);
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'INVOICE_RELATIONSHIP_IMMUTABLE' USING ERRCODE='55000'; END IF;
 SELECT * INTO a FROM public.finance_invoices WHERE tenant_id=NEW.tenant_id AND id=NEW.source_invoice_id FOR UPDATE;
 SELECT * INTO b FROM public.finance_invoices WHERE tenant_id=NEW.tenant_id AND id=NEW.related_invoice_id FOR UPDATE;
 IF a.id IS NULL OR b.id IS NULL OR a.customer_id<>b.customer_id OR a.currency_code<>b.currency_code THEN
  RAISE EXCEPTION 'INVOICE_RELATIONSHIP_PARTIES_OR_CURRENCY_MISMATCH' USING ERRCODE='23514';
 END IF;
 IF a.status<>'ISSUED' OR b.status<>'ISSUED' THEN
  RAISE EXCEPTION 'INVOICE_RELATIONSHIP_REQUIRES_ISSUED_DOCUMENTS' USING ERRCODE='23514';
 END IF;
 IF a.document_metadata->>'invoiceKind' IS DISTINCT FROM 'ADVANCE' OR b.document_metadata->>'invoiceKind' IS DISTINCT FROM 'BALANCE' THEN
  RAISE EXCEPTION 'INVOICE_TYPES_NOT_COMPATIBLE' USING ERRCODE='23514';
 END IF;
 SELECT COALESCE(sum(pa.amount-COALESCE(rv.amount,0)),0) INTO allocated
 FROM public.finance_payment_allocations pa
 LEFT JOIN (SELECT tenant_id,allocation_id,sum(amount) amount FROM public.finance_payment_allocation_reversals GROUP BY tenant_id,allocation_id) rv
 ON rv.tenant_id=pa.tenant_id AND rv.allocation_id=pa.id
 WHERE pa.tenant_id=NEW.tenant_id AND pa.invoice_id=NEW.source_invoice_id;
 SELECT COALESCE(sum(applied_amount),0) INTO already_applied
 FROM public.finance_invoice_relationships WHERE tenant_id=NEW.tenant_id AND source_invoice_id=NEW.source_invoice_id;
 IF NEW.applied_amount<=0 OR already_applied+NEW.applied_amount>allocated OR already_applied+NEW.applied_amount>a.grand_total THEN
  RAISE EXCEPTION 'ADVANCE_APPLICATION_EXCEEDS_PAID_AMOUNT' USING ERRCODE='23514';
 END IF;
 SELECT allocated_amount INTO balance_allocated FROM public.finance_payment_invoice_balances
  WHERE tenant_id=NEW.tenant_id AND invoice_id=NEW.related_invoice_id FOR UPDATE;
 IF balance_allocated IS NOT NULL THEN
  IF balance_allocated>b.grand_total-already_applied-NEW.applied_amount THEN
   RAISE EXCEPTION 'ADVANCE_APPLICATION_BELOW_EXISTING_SETTLEMENT' USING ERRCODE='23514';
  END IF;
  UPDATE public.finance_payment_invoice_balances SET invoice_total=b.grand_total-already_applied-NEW.applied_amount,updated_at=clock_timestamp()
   WHERE tenant_id=NEW.tenant_id AND invoice_id=NEW.related_invoice_id;
 END IF;
 RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.finance_guard_invoice_relationship() FROM PUBLIC;
