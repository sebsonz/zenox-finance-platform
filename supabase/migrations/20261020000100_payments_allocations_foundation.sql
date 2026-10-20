-- ZENOX Finance payments and allocations foundation.
-- Apply only to a disposable/approved ZENOX Finance database; never to ZENOX FRET.
-- All mutations are tenant-scoped, auditable and protected by idempotency records.

CREATE TABLE IF NOT EXISTS public.finance_payment_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.finance_tenants(id) ON DELETE RESTRICT,
  operation text NOT NULL CHECK (operation IN ('PAYMENT_CREATE', 'PAYMENT_CONFIRM_MANUAL', 'PAYMENT_ALLOCATE', 'ALLOCATION_REVERSE')),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 128),
  request_hash char(64) NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  state text NOT NULL DEFAULT 'IN_PROGRESS' CHECK (state IN ('IN_PROGRESS', 'SUCCEEDED')),
  resource_type text,
  resource_id uuid,
  response_body jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (tenant_id, operation, idempotency_key),
  CHECK ((state = 'IN_PROGRESS' AND completed_at IS NULL) OR
         (state = 'SUCCEEDED' AND completed_at IS NOT NULL AND resource_id IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS public.finance_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.finance_tenants(id) ON DELETE RESTRICT,
  amount numeric(24,8) NOT NULL CHECK (amount > 0),
  currency_code char(3) NOT NULL REFERENCES public.finance_currencies(code),
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'CONFIRMED', 'SETTLED', 'FAILED', 'CANCELLED')),
  source text NOT NULL CHECK (source IN ('MANUAL', 'PROVIDER')),
  method text NOT NULL CHECK (method IN ('CASH', 'BANK_TRANSFER', 'MOBILE_MONEY', 'CARD', 'OTHER', 'PROVIDER')),
  external_reference text,
  provider_code text,
  description text,
  created_by_actor_type text NOT NULL CHECK (created_by_actor_type IN ('USER', 'SERVICE', 'SYSTEM')),
  created_by_actor_ref text NOT NULL,
  confirmed_by_actor_type text CHECK (confirmed_by_actor_type IN ('USER', 'SERVICE', 'SYSTEM')),
  confirmed_by_actor_ref text,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  CHECK (external_reference IS NULL OR length(external_reference) <= 200),
  CHECK (provider_code IS NULL OR provider_code ~ '^[a-z0-9][a-z0-9._-]{1,79}$'),
  CHECK (description IS NULL OR length(description) <= 1000),
  CHECK ((status IN ('CONFIRMED','SETTLED') AND confirmed_at IS NOT NULL AND confirmed_by_actor_type IS NOT NULL AND confirmed_by_actor_ref IS NOT NULL)
      OR status NOT IN ('CONFIRMED','SETTLED')),
  CHECK ((source='MANUAL' AND method <> 'PROVIDER' AND provider_code IS NULL)
      OR (source='PROVIDER' AND method='PROVIDER' AND provider_code IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS public.finance_payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  payment_id uuid NOT NULL,
  event_type text NOT NULL CHECK (length(event_type) BETWEEN 1 AND 100),
  from_status text,
  to_status text,
  actor_type text NOT NULL CHECK (actor_type IN ('USER', 'SERVICE', 'SYSTEM')),
  actor_ref text NOT NULL,
  correlation_id text,
  idempotency_key text,
  safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(safe_metadata) = 'object'),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, payment_id) REFERENCES public.finance_payments(tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS finance_payment_events_tenant_payment_time_idx
  ON public.finance_payment_events (tenant_id, payment_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS public.finance_payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  payment_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  amount numeric(24,8) NOT NULL CHECK (amount > 0),
  currency_code char(3) NOT NULL REFERENCES public.finance_currencies(code),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 128),
  request_hash char(64) NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  allocated_by_actor_type text NOT NULL CHECK (allocated_by_actor_type IN ('USER', 'SERVICE', 'SYSTEM')),
  allocated_by_actor_ref text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, payment_id) REFERENCES public.finance_payments(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, invoice_id) REFERENCES public.finance_invoices(tenant_id, id) ON DELETE RESTRICT,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS finance_payment_allocations_payment_idx
  ON public.finance_payment_allocations (tenant_id, payment_id, created_at);
CREATE INDEX IF NOT EXISTS finance_payment_allocations_invoice_idx
  ON public.finance_payment_allocations (tenant_id, invoice_id, created_at);

-- Reversals are separate compensating records. Original allocation history is immutable.
CREATE TABLE IF NOT EXISTS public.finance_payment_allocation_reversals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  allocation_id uuid NOT NULL,
  amount numeric(24,8) NOT NULL CHECK (amount > 0),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 500),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 128),
  request_hash char(64) NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  reversed_by_actor_type text NOT NULL CHECK (reversed_by_actor_type IN ('USER', 'SERVICE', 'SYSTEM')),
  reversed_by_actor_ref text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, allocation_id) REFERENCES public.finance_payment_allocations(tenant_id, id) ON DELETE RESTRICT,
  UNIQUE (tenant_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS finance_payment_allocation_reversals_allocation_idx
  ON public.finance_payment_allocation_reversals (tenant_id, allocation_id);

-- Database-level guards backstop the service transaction locks. These functions are
-- SECURITY INVOKER so tenant RLS and least-privilege grants still apply.
CREATE OR REPLACE FUNCTION public.finance_guard_payment_allocation()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  payment_row public.finance_payments%ROWTYPE;
  invoice_row public.finance_invoices%ROWTYPE;
  payment_allocated numeric(24,8);
  payment_reversed numeric(24,8);
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

  SELECT COALESCE(SUM(a.amount),0) INTO payment_allocated
    FROM public.finance_payment_allocations a
   WHERE a.tenant_id=NEW.tenant_id AND a.payment_id=NEW.payment_id;
  SELECT COALESCE(SUM(r.amount),0) INTO payment_reversed
    FROM public.finance_payment_allocation_reversals r
    JOIN public.finance_payment_allocations a
      ON a.tenant_id=r.tenant_id AND a.id=r.allocation_id
   WHERE r.tenant_id=NEW.tenant_id AND a.payment_id=NEW.payment_id;
  SELECT COALESCE(SUM(a.amount),0) INTO invoice_allocated
    FROM public.finance_payment_allocations a
   WHERE a.tenant_id=NEW.tenant_id AND a.invoice_id=NEW.invoice_id;
  SELECT COALESCE(SUM(r.amount),0) INTO invoice_reversed
    FROM public.finance_payment_allocation_reversals r
    JOIN public.finance_payment_allocations a
      ON a.tenant_id=r.tenant_id AND a.id=r.allocation_id
   WHERE r.tenant_id=NEW.tenant_id AND a.invoice_id=NEW.invoice_id;

  IF NEW.amount > payment_row.amount - payment_allocated + payment_reversed THEN
    RAISE EXCEPTION 'PAYMENT_AMOUNT_EXCEEDED' USING ERRCODE='23514';
  END IF;
  IF NEW.amount > invoice_row.grand_total - invoice_allocated + invoice_reversed THEN
    RAISE EXCEPTION 'INVOICE_BALANCE_EXCEEDED' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER finance_payment_allocation_guard
BEFORE INSERT ON public.finance_payment_allocations
FOR EACH ROW EXECUTE FUNCTION public.finance_guard_payment_allocation();

CREATE OR REPLACE FUNCTION public.finance_guard_payment_allocation_reversal()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  allocation_row public.finance_payment_allocations%ROWTYPE;
  already_reversed numeric(24,8);
BEGIN
  SELECT * INTO allocation_row FROM public.finance_payment_allocations
   WHERE tenant_id=NEW.tenant_id AND id=NEW.allocation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ALLOCATION_NOT_FOUND' USING ERRCODE='23503'; END IF;
  SELECT COALESCE(SUM(amount),0) INTO already_reversed
    FROM public.finance_payment_allocation_reversals
   WHERE tenant_id=NEW.tenant_id AND allocation_id=NEW.allocation_id;
  IF NEW.amount > allocation_row.amount - already_reversed THEN
    RAISE EXCEPTION 'ALLOCATION_REVERSAL_EXCEEDED' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER finance_payment_allocation_reversal_guard
BEFORE INSERT ON public.finance_payment_allocation_reversals
FOR EACH ROW EXECUTE FUNCTION public.finance_guard_payment_allocation_reversal();

ALTER TABLE public.finance_payment_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_payment_commands FORCE ROW LEVEL SECURITY;
ALTER TABLE public.finance_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_payments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.finance_payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_payment_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.finance_payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_payment_allocations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.finance_payment_allocation_reversals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_payment_allocation_reversals FORCE ROW LEVEL SECURITY;

CREATE POLICY finance_payment_commands_tenant_isolation ON public.finance_payment_commands
  FOR ALL USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY finance_payments_tenant_isolation ON public.finance_payments
  FOR ALL USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY finance_payment_events_tenant_isolation ON public.finance_payment_events
  FOR ALL USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY finance_payment_allocations_tenant_isolation ON public.finance_payment_allocations
  FOR ALL USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY finance_payment_allocation_reversals_tenant_isolation ON public.finance_payment_allocation_reversals
  FOR ALL USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

REVOKE ALL ON TABLE public.finance_payment_commands, public.finance_payments,
  public.finance_payment_events, public.finance_payment_allocations,
  public.finance_payment_allocation_reversals FROM PUBLIC;
