-- Final guards for recurring schedule lifecycle and pro forma conversion ledger.
CREATE OR REPLACE FUNCTION public.finance_guard_recurring_invoice_schedule()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.status<>'DRAFT' THEN RAISE EXCEPTION 'NON_DRAFT_RECURRING_SCHEDULE_IMMUTABLE' USING ERRCODE='55000'; END IF;
  RETURN OLD;
 END IF;
 IF OLD.status<>'DRAFT' THEN
  IF (to_jsonb(NEW)-'status'-'next_run_on'-'updated_at'-'updated_by_actor_type'-'updated_by_actor_ref')
    IS DISTINCT FROM
     (to_jsonb(OLD)-'status'-'next_run_on'-'updated_at'-'updated_by_actor_type'-'updated_by_actor_ref')
  THEN RAISE EXCEPTION 'ACTIVE_RECURRING_SCHEDULE_CONFIGURATION_IMMUTABLE' USING ERRCODE='55000'; END IF;
  IF NOT (
   (OLD.status='ACTIVE' AND NEW.status IN ('ACTIVE','PAUSED','CANCELLED','COMPLETED'))
   OR (OLD.status='PAUSED' AND NEW.status IN ('ACTIVE','CANCELLED'))
  ) THEN RAISE EXCEPTION 'INVALID_RECURRING_SCHEDULE_TRANSITION' USING ERRCODE='23514'; END IF;
 ELSE
  IF NEW.status NOT IN ('DRAFT','ACTIVE','CANCELLED') THEN RAISE EXCEPTION 'INVALID_RECURRING_SCHEDULE_TRANSITION' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.finance_guard_proforma_conversion()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
 RAISE EXCEPTION 'PROFORMA_CONVERSION_LEDGER_IMMUTABLE' USING ERRCODE='55000';
END;
$function$;
DROP TRIGGER IF EXISTS finance_recurring_schedule_guard ON public.finance_recurring_invoice_schedules;
CREATE TRIGGER finance_recurring_schedule_guard BEFORE UPDATE OR DELETE ON public.finance_recurring_invoice_schedules
 FOR EACH ROW EXECUTE FUNCTION public.finance_guard_recurring_invoice_schedule();
DROP TRIGGER IF EXISTS finance_proforma_conversion_guard ON public.finance_proforma_conversions;
CREATE TRIGGER finance_proforma_conversion_guard BEFORE UPDATE OR DELETE ON public.finance_proforma_conversions
 FOR EACH ROW EXECUTE FUNCTION public.finance_guard_proforma_conversion();
REVOKE ALL ON FUNCTION public.finance_guard_recurring_invoice_schedule() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finance_guard_proforma_conversion() FROM PUBLIC;
