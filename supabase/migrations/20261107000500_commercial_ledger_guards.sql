-- Tighten immutability and aggregate limits for commercial ledger records.
-- Additive ZENOX Finance migration only.
CREATE OR REPLACE FUNCTION public.finance_guard_invoice_relationship()
RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE a public.finance_invoices%ROWTYPE; b public.finance_invoices%ROWTYPE; allocated numeric(24,8); already_applied numeric(24,8);
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'INVOICE_RELATIONSHIP_IMMUTABLE' USING ERRCODE='55000'; END IF;
 SELECT * INTO a FROM public.finance_invoices WHERE tenant_id=NEW.tenant_id AND id=NEW.source_invoice_id FOR UPDATE;
 SELECT * INTO b FROM public.finance_invoices WHERE tenant_id=NEW.tenant_id AND id=NEW.related_invoice_id;
 IF a.id IS NULL OR b.id IS NULL OR a.customer_id<>b.customer_id OR a.currency_code<>b.currency_code THEN
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
 SELECT COALESCE(sum(applied_amount),0) INTO already_applied
 FROM public.finance_invoice_relationships WHERE tenant_id=NEW.tenant_id AND source_invoice_id=NEW.source_invoice_id;
 IF NEW.applied_amount<=0 OR already_applied+NEW.applied_amount>allocated OR already_applied+NEW.applied_amount>a.grand_total THEN
  RAISE EXCEPTION 'ADVANCE_APPLICATION_EXCEEDS_PAID_AMOUNT' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS finance_invoice_relationship_guard ON public.finance_invoice_relationships;
CREATE TRIGGER finance_invoice_relationship_guard BEFORE INSERT OR UPDATE OR DELETE ON public.finance_invoice_relationships
 FOR EACH ROW EXECUTE FUNCTION public.finance_guard_invoice_relationship();

CREATE OR REPLACE FUNCTION public.finance_guard_invoice_adjustment()
RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE source public.finance_invoices%ROWTYPE; credited numeric(24,8); legacy_credited numeric(24,8);
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'ISSUED_INVOICE_ADJUSTMENT_IMMUTABLE' USING ERRCODE='55000'; END IF;
 SELECT * INTO source FROM public.finance_invoices WHERE tenant_id=NEW.tenant_id AND id=NEW.original_invoice_id FOR UPDATE;
 IF NOT FOUND OR source.status<>'ISSUED' OR source.tax_status<>'CALCULATED'
   OR source.tax_snapshot_id IS DISTINCT FROM NEW.source_tax_snapshot_id
   OR source.tax_snapshot_version IS DISTINCT FROM NEW.source_tax_snapshot_version
   OR source.currency_code<>NEW.currency_code THEN
  RAISE EXCEPTION 'ADJUSTMENT_REQUIRES_MATCHING_ISSUED_TAX_INVOICE' USING ERRCODE='23514';
 END IF;
 IF NEW.adjustment_type='CREDIT_NOTE' THEN
  SELECT COALESCE(sum(grand_total),0) INTO credited FROM public.finance_invoice_adjustments
   WHERE tenant_id=NEW.tenant_id AND original_invoice_id=NEW.original_invoice_id AND adjustment_type='CREDIT_NOTE';
  SELECT COALESCE(sum(grand_total),0) INTO legacy_credited FROM public.finance_credit_notes
   WHERE tenant_id=NEW.tenant_id AND original_invoice_id=NEW.original_invoice_id;
  IF credited+legacy_credited+NEW.grand_total>source.grand_total THEN
   RAISE EXCEPTION 'CREDIT_NOTE_EXCEEDS_REMAINING_INVOICE_VALUE' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.finance_guard_recurring_invoice_lines()
RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE t uuid; s uuid;
BEGIN
 t:=CASE WHEN TG_OP='DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END;
 s:=CASE WHEN TG_OP='DELETE' THEN OLD.schedule_id ELSE NEW.schedule_id END;
 IF EXISTS(SELECT 1 FROM public.finance_recurring_invoice_schedules WHERE tenant_id=t AND id=s AND status<>'DRAFT') THEN
  RAISE EXCEPTION 'ACTIVE_RECURRING_SCHEDULE_LINES_IMMUTABLE' USING ERRCODE='55000';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.finance_guard_recurring_invoice_run()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
 RAISE EXCEPTION 'RECURRING_INVOICE_RUN_IMMUTABLE' USING ERRCODE='55000';
END;
$function$;
DROP TRIGGER IF EXISTS finance_recurring_invoice_lines_guard ON public.finance_recurring_invoice_lines;
CREATE TRIGGER finance_recurring_invoice_lines_guard BEFORE INSERT OR UPDATE OR DELETE ON public.finance_recurring_invoice_lines
 FOR EACH ROW EXECUTE FUNCTION public.finance_guard_recurring_invoice_lines();
DROP TRIGGER IF EXISTS finance_recurring_invoice_runs_guard ON public.finance_recurring_invoice_runs;
CREATE TRIGGER finance_recurring_invoice_runs_guard BEFORE UPDATE OR DELETE ON public.finance_recurring_invoice_runs
 FOR EACH ROW EXECUTE FUNCTION public.finance_guard_recurring_invoice_run();
REVOKE ALL ON FUNCTION public.finance_guard_invoice_relationship() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finance_guard_invoice_adjustment() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finance_guard_recurring_invoice_lines() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finance_guard_recurring_invoice_run() FROM PUBLIC;
