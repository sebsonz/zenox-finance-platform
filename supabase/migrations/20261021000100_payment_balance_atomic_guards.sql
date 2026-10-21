-- Atomic payment/invoice balance counters prevent concurrent writes from over-consuming funds.
-- Finance database only. Never apply to ZENOX FRET.

ALTER TABLE public.finance_payments
  ADD COLUMN allocated_amount numeric(24,8) NOT NULL DEFAULT 0 CHECK (allocated_amount >= 0),
  ADD COLUMN refund_reserved_amount numeric(24,8) NOT NULL DEFAULT 0 CHECK (refund_reserved_amount >= 0);

CREATE TABLE public.finance_payment_invoice_balances (
  tenant_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  invoice_total numeric(24,8) NOT NULL CHECK (invoice_total > 0),
  allocated_amount numeric(24,8) NOT NULL DEFAULT 0 CHECK (allocated_amount >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,invoice_id),
  FOREIGN KEY (tenant_id,invoice_id) REFERENCES public.finance_invoices(tenant_id,id) ON DELETE RESTRICT,
  CHECK (allocated_amount <= invoice_total)
);

-- Backfill defensively in case a staging environment already contains payment data.
UPDATE public.finance_payments p
SET allocated_amount = COALESCE((
      SELECT SUM(a.amount) - COALESCE((
        SELECT SUM(r.amount) FROM public.finance_payment_allocation_reversals r
        JOIN public.finance_payment_allocations ra ON ra.tenant_id=r.tenant_id AND ra.id=r.allocation_id
        WHERE ra.tenant_id=p.tenant_id AND ra.payment_id=p.id
      ),0)
      FROM public.finance_payment_allocations a
      WHERE a.tenant_id=p.tenant_id AND a.payment_id=p.id
    ),0),
    refund_reserved_amount = COALESCE((
      SELECT SUM(r.amount) FROM public.finance_payment_refunds r
      WHERE r.tenant_id=p.tenant_id AND r.payment_id=p.id AND r.status NOT IN ('FAILED','CANCELLED')
    ),0);

INSERT INTO public.finance_payment_invoice_balances (tenant_id,invoice_id,invoice_total,allocated_amount)
SELECT i.tenant_id,i.id,i.grand_total,
       COALESCE(SUM(a.amount),0) - COALESCE((
         SELECT SUM(r.amount) FROM public.finance_payment_allocation_reversals r
         JOIN public.finance_payment_allocations ra ON ra.tenant_id=r.tenant_id AND ra.id=r.allocation_id
         WHERE ra.tenant_id=i.tenant_id AND ra.invoice_id=i.id
       ),0)
FROM public.finance_invoices i
JOIN public.finance_payment_allocations a ON a.tenant_id=i.tenant_id AND a.invoice_id=i.id
GROUP BY i.tenant_id,i.id,i.grand_total
ON CONFLICT (tenant_id,invoice_id) DO UPDATE
SET invoice_total=EXCLUDED.invoice_total,allocated_amount=EXCLUDED.allocated_amount,updated_at=clock_timestamp();

ALTER TABLE public.finance_payment_invoice_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_payment_invoice_balances FORCE ROW LEVEL SECURITY;
CREATE POLICY finance_payment_invoice_balances_tenant_isolation
  ON public.finance_payment_invoice_balances
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id',true),'')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id',true),'')::uuid);
REVOKE ALL ON TABLE public.finance_payment_invoice_balances FROM PUBLIC;

-- All checks below are SECURITY INVOKER. RLS and ordinary grants remain effective.
-- Atomic UPDATE/UPSERT predicates serialize concurrent transactions without relying on
-- aggregate queries over a snapshot that may predate a transaction waiting on a row lock.
CREATE OR REPLACE FUNCTION public.finance_guard_payment_allocation()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  payment_row public.finance_payments%ROWTYPE;
  invoice_row public.finance_invoices%ROWTYPE;
  allocated_payment_id uuid;
  allocated_invoice_id uuid;
BEGIN
  SELECT * INTO payment_row FROM public.finance_payments
   WHERE tenant_id=NEW.tenant_id AND id=NEW.payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_NOT_FOUND' USING ERRCODE='23503'; END IF;
  SELECT * INTO invoice_row FROM public.finance_invoices
   WHERE tenant_id=NEW.tenant_id AND id=NEW.invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVOICE_NOT_FOUND' USING ERRCODE='23503'; END IF;
  IF payment_row.status NOT IN ('CONFIRMED','SETTLED') THEN
    RAISE EXCEPTION 'PAYMENT_NOT_CONFIRMED' USING ERRCODE='23514';
  END IF;
  IF invoice_row.status <> 'ISSUED' THEN RAISE EXCEPTION 'INVOICE_NOT_ISSUED' USING ERRCODE='23514'; END IF;
  IF btrim(payment_row.currency_code) <> btrim(invoice_row.currency_code)
     OR btrim(NEW.currency_code) <> btrim(payment_row.currency_code) THEN
    RAISE EXCEPTION 'PAYMENT_CURRENCY_MISMATCH' USING ERRCODE='23514';
  END IF;
  IF NEW.amount <> round(NEW.amount,invoice_row.currency_minor_unit) THEN
    RAISE EXCEPTION 'AMOUNT_PRECISION_INVALID' USING ERRCODE='23514';
  END IF;

  UPDATE public.finance_payments
     SET allocated_amount=allocated_amount+NEW.amount,updated_at=clock_timestamp()
   WHERE tenant_id=NEW.tenant_id AND id=NEW.payment_id
     AND amount-allocated_amount-refund_reserved_amount >= NEW.amount
   RETURNING id INTO allocated_payment_id;
  IF allocated_payment_id IS NULL THEN
    RAISE EXCEPTION 'PAYMENT_AMOUNT_EXCEEDED' USING ERRCODE='23514';
  END IF;

  INSERT INTO public.finance_payment_invoice_balances
    (tenant_id,invoice_id,invoice_total,allocated_amount)
  VALUES (NEW.tenant_id,NEW.invoice_id,invoice_row.grand_total,NEW.amount)
  ON CONFLICT (tenant_id,invoice_id) DO UPDATE
    SET allocated_amount=finance_payment_invoice_balances.allocated_amount+EXCLUDED.allocated_amount,
        updated_at=clock_timestamp()
    WHERE finance_payment_invoice_balances.invoice_total=EXCLUDED.invoice_total
      AND finance_payment_invoice_balances.invoice_total-finance_payment_invoice_balances.allocated_amount >= EXCLUDED.allocated_amount
  RETURNING invoice_id INTO allocated_invoice_id;
  IF allocated_invoice_id IS NULL THEN
    RAISE EXCEPTION 'INVOICE_BALANCE_EXCEEDED' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.finance_guard_payment_allocation_reversal()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  allocation_row public.finance_payment_allocations%ROWTYPE;
  already_reversed numeric(24,8);
  payment_id uuid;
  invoice_id uuid;
BEGIN
  SELECT * INTO allocation_row FROM public.finance_payment_allocations
   WHERE tenant_id=NEW.tenant_id AND id=NEW.allocation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ALLOCATION_NOT_FOUND' USING ERRCODE='23503'; END IF;
  SELECT COALESCE(SUM(amount),0) INTO already_reversed
    FROM public.finance_payment_allocation_reversals
   WHERE tenant_id=NEW.tenant_id AND allocation_id=NEW.allocation_id;
  IF NEW.amount > allocation_row.amount-already_reversed THEN
    RAISE EXCEPTION 'ALLOCATION_REVERSAL_EXCEEDED' USING ERRCODE='23514';
  END IF;

  UPDATE public.finance_payments
     SET allocated_amount=allocated_amount-NEW.amount,updated_at=clock_timestamp()
   WHERE tenant_id=NEW.tenant_id AND id=allocation_row.payment_id AND allocated_amount >= NEW.amount
   RETURNING id INTO payment_id;
  IF payment_id IS NULL THEN RAISE EXCEPTION 'PAYMENT_BALANCE_INVARIANT' USING ERRCODE='23514'; END IF;

  UPDATE public.finance_payment_invoice_balances AS balance
     SET allocated_amount=balance.allocated_amount-NEW.amount,updated_at=clock_timestamp()
   WHERE balance.tenant_id=NEW.tenant_id AND balance.invoice_id=allocation_row.invoice_id AND balance.allocated_amount >= NEW.amount
   RETURNING balance.invoice_id INTO invoice_id;
  IF invoice_id IS NULL THEN RAISE EXCEPTION 'INVOICE_BALANCE_INVARIANT' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.finance_guard_payment_refund()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  payment_row public.finance_payments%ROWTYPE;
  minor_unit integer;
  reserved_payment_id uuid;
BEGIN
  SELECT * INTO payment_row FROM public.finance_payments
   WHERE tenant_id=NEW.tenant_id AND id=NEW.payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_NOT_FOUND' USING ERRCODE='23503'; END IF;
  IF payment_row.status NOT IN ('CONFIRMED','SETTLED') THEN
    RAISE EXCEPTION 'PAYMENT_NOT_CONFIRMED' USING ERRCODE='23514';
  END IF;
  IF btrim(payment_row.currency_code) <> btrim(NEW.currency_code) THEN
    RAISE EXCEPTION 'PAYMENT_CURRENCY_MISMATCH' USING ERRCODE='23514';
  END IF;
  SELECT c.minor_unit INTO minor_unit FROM public.finance_currencies c WHERE c.code=btrim(NEW.currency_code) AND c.is_active=true;
  IF minor_unit IS NULL THEN RAISE EXCEPTION 'CURRENCY_NOT_SUPPORTED' USING ERRCODE='23514'; END IF;
  IF NEW.amount <> round(NEW.amount,minor_unit) THEN
    RAISE EXCEPTION 'AMOUNT_PRECISION_INVALID' USING ERRCODE='23514';
  END IF;

  UPDATE public.finance_payments
     SET refund_reserved_amount=refund_reserved_amount+NEW.amount,updated_at=clock_timestamp()
   WHERE tenant_id=NEW.tenant_id AND id=NEW.payment_id
     AND amount-allocated_amount-refund_reserved_amount >= NEW.amount
   RETURNING id INTO reserved_payment_id;
  IF reserved_payment_id IS NULL THEN RAISE EXCEPTION 'REFUND_AMOUNT_EXCEEDED' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.finance_guard_payment_refund_update()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  released_payment_id uuid;
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.payment_id IS DISTINCT FROM OLD.payment_id
     OR NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.currency_code IS DISTINCT FROM OLD.currency_code
     OR NEW.reason IS DISTINCT FROM OLD.reason
     OR NEW.requested_by_actor_type IS DISTINCT FROM OLD.requested_by_actor_type
     OR NEW.requested_by_actor_ref IS DISTINCT FROM OLD.requested_by_actor_ref
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'REFUND_IMMUTABLE_FIELDS' USING ERRCODE='23514';
  END IF;

  IF OLD.status='REQUESTED' AND NEW.status NOT IN ('APPROVED','CANCELLED') THEN
    RAISE EXCEPTION 'REFUND_INVALID_TRANSITION' USING ERRCODE='23514';
  ELSIF OLD.status='APPROVED' AND NEW.status NOT IN ('SUCCEEDED','FAILED','CANCELLED') THEN
    RAISE EXCEPTION 'REFUND_INVALID_TRANSITION' USING ERRCODE='23514';
  ELSIF OLD.status IN ('SUCCEEDED','FAILED','CANCELLED') THEN
    RAISE EXCEPTION 'REFUND_TERMINAL_STATE' USING ERRCODE='23514';
  END IF;

  IF NEW.status IN ('CANCELLED','FAILED') AND OLD.status IN ('REQUESTED','APPROVED') THEN
    UPDATE public.finance_payments
       SET refund_reserved_amount=refund_reserved_amount-OLD.amount,updated_at=clock_timestamp()
     WHERE tenant_id=OLD.tenant_id AND id=OLD.payment_id AND refund_reserved_amount >= OLD.amount
     RETURNING id INTO released_payment_id;
    IF released_payment_id IS NULL THEN RAISE EXCEPTION 'REFUND_RESERVATION_INVARIANT' USING ERRCODE='23514'; END IF;
  END IF;

  NEW.updated_at=clock_timestamp();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS finance_payment_refund_update_guard ON public.finance_payment_refunds;
CREATE TRIGGER finance_payment_refund_update_guard
BEFORE UPDATE ON public.finance_payment_refunds
FOR EACH ROW EXECUTE FUNCTION public.finance_guard_payment_refund_update();

