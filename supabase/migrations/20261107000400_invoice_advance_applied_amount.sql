-- Record the portion of a confirmed/allocated advance applied to a related balance invoice.
-- Finance database only; additive migration.
ALTER TABLE public.finance_invoice_relationships
 ADD COLUMN IF NOT EXISTS applied_amount numeric(24,8) NOT NULL DEFAULT 0 CHECK (applied_amount>=0);
CREATE OR REPLACE FUNCTION public.finance_guard_invoice_relationship()
RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE a public.finance_invoices%ROWTYPE; b public.finance_invoices%ROWTYPE; allocated numeric(24,8);
BEGIN
 SELECT * INTO a FROM public.finance_invoices WHERE tenant_id=NEW.tenant_id AND id=NEW.source_invoice_id;
 SELECT * INTO b FROM public.finance_invoices WHERE tenant_id=NEW.tenant_id AND id=NEW.related_invoice_id;
 IF NOT FOUND OR a.id IS NULL OR b.id IS NULL OR a.customer_id<>b.customer_id OR a.currency_code<>b.currency_code THEN
  RAISE EXCEPTION 'INVOICE_RELATIONSHIP_PARTIES_OR_CURRENCY_MISMATCH' USING ERRCODE='23514';
 END IF;
 IF a.status<>'ISSUED' OR b.status<>'ISSUED' THEN
  RAISE EXCEPTION 'INVOICE_RELATIONSHIP_REQUIRES_ISSUED_DOCUMENTS' USING ERRCODE='23514';
 END IF;
 SELECT COALESCE(sum(pa.amount-COALESCE(rv.amount,0)),0) INTO allocated
 FROM public.finance_payment_allocations pa
 LEFT JOIN (SELECT tenant_id,allocation_id,sum(amount) amount FROM public.finance_payment_allocation_reversals GROUP BY tenant_id,allocation_id) rv
 ON rv.tenant_id=pa.tenant_id AND rv.allocation_id=pa.id
 WHERE pa.tenant_id=NEW.tenant_id AND pa.invoice_id=NEW.source_invoice_id;
 IF NEW.applied_amount>allocated OR NEW.applied_amount>a.grand_total THEN
  RAISE EXCEPTION 'ADVANCE_APPLICATION_EXCEEDS_PAID_AMOUNT' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$function$;
