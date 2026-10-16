-- Sequence-safe invoice issuance and immutable issued-document guard.
-- Finance-only, additive migration. Never apply to ZENOX FRET V2.

CREATE TABLE IF NOT EXISTS public.finance_invoice_number_sequences (
  tenant_id uuid NOT NULL,
  fiscal_year integer NOT NULL CHECK (fiscal_year BETWEEN 2000 AND 9999),
  next_number bigint NOT NULL CHECK (next_number > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, fiscal_year)
);

ALTER TABLE public.finance_invoice_number_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_invoice_number_sequences FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS finance_invoice_number_sequences_tenant_policy
  ON public.finance_invoice_number_sequences;
CREATE POLICY finance_invoice_number_sequences_tenant_policy
  ON public.finance_invoice_number_sequences
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE public.finance_invoices
  ADD COLUMN IF NOT EXISTS issued_at timestamptz,
  ADD COLUMN IF NOT EXISTS issued_by_principal_id uuid;

DO $constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'finance_invoices_issued_fields_ck'
       AND conrelid = 'public.finance_invoices'::regclass
  ) THEN
    ALTER TABLE public.finance_invoices
      ADD CONSTRAINT finance_invoices_issued_fields_ck
      CHECK (
        (status = 'DRAFT' AND invoice_code IS NULL AND issue_date IS NULL AND issued_at IS NULL)
        OR
        (status IN ('ISSUED', 'CANCELLED') AND invoice_code IS NOT NULL
          AND issue_date IS NOT NULL AND issued_at IS NOT NULL)
      ) NOT VALID;
  END IF;
END;
$constraints$;

CREATE UNIQUE INDEX IF NOT EXISTS finance_invoices_tenant_invoice_code_uq
  ON public.finance_invoices (tenant_id, invoice_code)
  WHERE invoice_code IS NOT NULL;

CREATE OR REPLACE FUNCTION public.finance_allocate_invoice_number(
  p_tenant_id uuid,
  p_fiscal_year integer
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  allocated bigint;
BEGIN
  IF p_tenant_id IS NULL OR p_fiscal_year < 2000 OR p_fiscal_year > 9999 THEN
    RAISE EXCEPTION 'INVALID_INVOICE_SEQUENCE_ARGUMENT' USING ERRCODE = '22023';
  END IF;

  IF NULLIF(current_setting('app.tenant_id', true), '') IS DISTINCT FROM p_tenant_id::text THEN
    RAISE EXCEPTION 'TENANT_CONTEXT_MISMATCH' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.finance_invoice_number_sequences AS seq
    (tenant_id, fiscal_year, next_number)
  VALUES (p_tenant_id, p_fiscal_year, 2)
  ON CONFLICT (tenant_id, fiscal_year)
  DO UPDATE SET next_number = seq.next_number + 1, updated_at = clock_timestamp()
  RETURNING next_number - 1 INTO allocated;

  RETURN allocated;
END;
$function$;

REVOKE ALL ON FUNCTION public.finance_allocate_invoice_number(uuid, integer) FROM PUBLIC;
REVOKE ALL ON TABLE public.finance_invoice_number_sequences FROM PUBLIC;

DO $grants$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['finance_runtime', 'finance_runtime_test'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.finance_allocate_invoice_number(uuid, integer) TO %I', role_name);
      EXECUTE format('REVOKE ALL ON TABLE public.finance_invoice_number_sequences FROM %I', role_name);
    END IF;
  END LOOP;
END;
$grants$;

CREATE OR REPLACE FUNCTION public.finance_guard_issued_invoice_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('ISSUED', 'CANCELLED') THEN
      RAISE EXCEPTION 'ISSUED_INVOICE_IMMUTABLE' USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status IN ('ISSUED', 'CANCELLED') THEN
    RAISE EXCEPTION 'ISSUED_INVOICE_IMMUTABLE' USING ERRCODE = '55000';
  END IF;

  IF OLD.status <> NEW.status AND NOT (OLD.status = 'DRAFT' AND NEW.status = 'ISSUED') THEN
    RAISE EXCEPTION 'INVALID_INVOICE_STATUS_TRANSITION' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS finance_invoice_issued_immutability_guard ON public.finance_invoices;
CREATE TRIGGER finance_invoice_issued_immutability_guard
  BEFORE UPDATE OR DELETE ON public.finance_invoices
  FOR EACH ROW EXECUTE FUNCTION public.finance_guard_issued_invoice_immutability();

CREATE OR REPLACE FUNCTION public.finance_guard_issued_invoice_lines()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  parent_tenant_id uuid;
  parent_invoice_id uuid;
BEGIN
  parent_tenant_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END;
  parent_invoice_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.invoice_id ELSE NEW.invoice_id END;

  IF EXISTS (
    SELECT 1 FROM public.finance_invoices i
     WHERE i.tenant_id = parent_tenant_id
       AND i.id = parent_invoice_id
       AND i.status IN ('ISSUED', 'CANCELLED')
  ) THEN
    RAISE EXCEPTION 'ISSUED_INVOICE_LINES_IMMUTABLE' USING ERRCODE = '55000';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;

DROP TRIGGER IF EXISTS finance_invoice_lines_issued_immutability_guard ON public.finance_invoice_lines;
CREATE TRIGGER finance_invoice_lines_issued_immutability_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.finance_invoice_lines
  FOR EACH ROW EXECUTE FUNCTION public.finance_guard_issued_invoice_lines();

REVOKE ALL ON FUNCTION public.finance_guard_issued_invoice_immutability() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finance_guard_issued_invoice_lines() FROM PUBLIC;

COMMENT ON TABLE public.finance_invoice_number_sequences IS
  'Tenant-scoped, transactionally allocated invoice numbering counters; sequence allocation is performed through a tenant-context-checked function.';
COMMENT ON COLUMN public.finance_invoices.issued_at IS
  'UTC timestamp at which this invoice became an immutable issued document.';
