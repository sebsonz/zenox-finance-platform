-- Add the controlled manual-refund lifecycle and reconciliation import foundation.
-- Finance database only. Do not apply to ZENOX FRET or any persistent DB without approval.

ALTER TABLE public.finance_payment_commands
  DROP CONSTRAINT finance_payment_commands_operation_check;
ALTER TABLE public.finance_payment_commands
  ADD CONSTRAINT finance_payment_commands_operation_check
  CHECK (operation IN (
    'PAYMENT_CREATE','PAYMENT_CONFIRM_MANUAL','PAYMENT_ALLOCATE','ALLOCATION_REVERSE',
    'REFUND_REQUEST','REFUND_APPROVE','REFUND_RECORD_MANUAL_SUCCESS','REFUND_CANCEL'
  ));

CREATE TABLE public.finance_payment_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  payment_id uuid NOT NULL,
  amount numeric(24,8) NOT NULL CHECK (amount > 0),
  currency_code char(3) NOT NULL REFERENCES public.finance_currencies(code),
  status text NOT NULL DEFAULT 'REQUESTED'
    CHECK (status IN ('REQUESTED','APPROVED','SUCCEEDED','FAILED','CANCELLED')),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 500),
  external_reference text,
  requested_by_actor_type text NOT NULL CHECK (requested_by_actor_type IN ('USER','SERVICE','SYSTEM')),
  requested_by_actor_ref text NOT NULL,
  approved_by_actor_type text CHECK (approved_by_actor_type IN ('USER','SERVICE','SYSTEM')),
  approved_by_actor_ref text,
  approved_at timestamptz,
  completed_by_actor_type text CHECK (completed_by_actor_type IN ('USER','SERVICE','SYSTEM')),
  completed_by_actor_ref text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id,payment_id) REFERENCES public.finance_payments(tenant_id,id) ON DELETE RESTRICT,
  CHECK (external_reference IS NULL OR length(external_reference) <= 200),
  CHECK ((status='APPROVED' AND approved_at IS NOT NULL AND approved_by_actor_type IS NOT NULL AND approved_by_actor_ref IS NOT NULL)
      OR status <> 'APPROVED'),
  CHECK ((status='SUCCEEDED' AND completed_at IS NOT NULL AND completed_by_actor_type IS NOT NULL AND completed_by_actor_ref IS NOT NULL)
      OR status <> 'SUCCEEDED')
);
CREATE INDEX finance_payment_refunds_payment_status_idx
  ON public.finance_payment_refunds (tenant_id,payment_id,status,created_at DESC);

CREATE TABLE public.finance_payment_reconciliation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.finance_tenants(id) ON DELETE RESTRICT,
  provider_code text NOT NULL CHECK (provider_code ~ '^[a-z0-9][a-z0-9._-]{1,79}$'),
  external_reference text NOT NULL CHECK (length(btrim(external_reference)) BETWEEN 1 AND 200),
  amount numeric(24,8) NOT NULL CHECK (amount > 0),
  currency_code char(3) NOT NULL REFERENCES public.finance_currencies(code),
  transaction_date timestamptz,
  status text NOT NULL DEFAULT 'UNMATCHED'
    CHECK (status IN ('UNMATCHED','MATCHED','CONFLICT','IGNORED')),
  matched_payment_id uuid,
  import_batch_id uuid NOT NULL DEFAULT gen_random_uuid(),
  safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(safe_metadata)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,matched_payment_id) REFERENCES public.finance_payments(tenant_id,id) ON DELETE RESTRICT,
  UNIQUE (tenant_id,provider_code,external_reference),
  CHECK ((status='MATCHED' AND matched_payment_id IS NOT NULL) OR status <> 'MATCHED')
);
CREATE INDEX finance_payment_reconciliation_status_idx
  ON public.finance_payment_reconciliation_items (tenant_id,status,created_at DESC);

ALTER TABLE public.finance_payment_refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_payment_refunds FORCE ROW LEVEL SECURITY;
ALTER TABLE public.finance_payment_reconciliation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_payment_reconciliation_items FORCE ROW LEVEL SECURITY;

CREATE POLICY finance_payment_refunds_tenant_isolation ON public.finance_payment_refunds
  FOR ALL USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY finance_payment_reconciliation_tenant_isolation ON public.finance_payment_reconciliation_items
  FOR ALL USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

REVOKE ALL ON TABLE public.finance_payment_refunds, public.finance_payment_reconciliation_items FROM PUBLIC;

-- A refund reserves unallocated payment funds while REQUESTED/APPROVED and consumes
-- them permanently when SUCCEEDED. Failed/cancelled refunds release the reservation.
CREATE OR REPLACE FUNCTION public.finance_guard_payment_allocation()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  payment_row public.finance_payments%ROWTYPE;
  invoice_row public.finance_invoices%ROWTYPE;
  payment_allocated numeric(24,8);
  payment_reversed numeric(24,8);
  payment_refunded numeric(24,8);
  invoice_allocated numeric(24,8);
  invoice_reversed numeric(24,8);
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

  SELECT COALESCE(SUM(a.amount),0) INTO payment_allocated FROM public.finance_payment_allocations a
   WHERE a.tenant_id=NEW.tenant_id AND a.payment_id=NEW.payment_id;
  SELECT COALESCE(SUM(r.amount),0) INTO payment_reversed
    FROM public.finance_payment_allocation_reversals r
    JOIN public.finance_payment_allocations a ON a.tenant_id=r.tenant_id AND a.id=r.allocation_id
   WHERE r.tenant_id=NEW.tenant_id AND a.payment_id=NEW.payment_id;
  SELECT COALESCE(SUM(r.amount),0) INTO payment_refunded FROM public.finance_payment_refunds r
   WHERE r.tenant_id=NEW.tenant_id AND r.payment_id=NEW.payment_id
     AND r.status NOT IN ('FAILED','CANCELLED');
  SELECT COALESCE(SUM(a.amount),0) INTO invoice_allocated FROM public.finance_payment_allocations a
   WHERE a.tenant_id=NEW.tenant_id AND a.invoice_id=NEW.invoice_id;
  SELECT COALESCE(SUM(r.amount),0) INTO invoice_reversed
    FROM public.finance_payment_allocation_reversals r
    JOIN public.finance_payment_allocations a ON a.tenant_id=r.tenant_id AND a.id=r.allocation_id
   WHERE r.tenant_id=NEW.tenant_id AND a.invoice_id=NEW.invoice_id;

  IF NEW.amount > payment_row.amount - payment_allocated + payment_reversed - payment_refunded THEN
    RAISE EXCEPTION 'PAYMENT_AMOUNT_EXCEEDED' USING ERRCODE='23514';
  END IF;
  IF NEW.amount > invoice_row.grand_total - invoice_allocated + invoice_reversed THEN
    RAISE EXCEPTION 'INVOICE_BALANCE_EXCEEDED' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$function$;

-- Serialize refund requests against allocations by locking the payment row in service code.
