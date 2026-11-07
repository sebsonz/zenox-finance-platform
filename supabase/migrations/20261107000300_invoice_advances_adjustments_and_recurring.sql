-- Advances/balance relationships, partial debit/credit adjustments and recurring billing.
-- Additive ZENOX Finance schema only. Do not apply to ZENOX FRET.
CREATE TABLE IF NOT EXISTS public.finance_invoice_relationships (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.finance_tenants(id) ON DELETE RESTRICT,
 source_invoice_id uuid NOT NULL,
 related_invoice_id uuid NOT NULL,
 relationship_type text NOT NULL CHECK (relationship_type IN ('ADVANCE_FOR','BALANCE_OF','REPLACES')),
 source_reference text,
 created_at timestamptz NOT NULL DEFAULT now(),
 created_by_actor_type text NOT NULL CHECK (created_by_actor_type IN ('USER','SERVICE','SYSTEM')),
 created_by_actor_ref text NOT NULL,
 FOREIGN KEY (tenant_id,source_invoice_id) REFERENCES public.finance_invoices(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY (tenant_id,related_invoice_id) REFERENCES public.finance_invoices(tenant_id,id) ON DELETE RESTRICT,
 UNIQUE (tenant_id,source_invoice_id,related_invoice_id,relationship_type),
 CHECK (source_invoice_id <> related_invoice_id)
);
CREATE TABLE IF NOT EXISTS public.finance_invoice_adjustments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.finance_tenants(id) ON DELETE RESTRICT,
 original_invoice_id uuid NOT NULL,
 adjustment_code text NOT NULL,
 adjustment_type text NOT NULL CHECK (adjustment_type IN ('CREDIT_NOTE','DEBIT_NOTE')),
 status text NOT NULL DEFAULT 'ISSUED' CHECK (status='ISSUED'),
 reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 2000),
 currency_code char(3) NOT NULL,
 currency_minor_unit smallint NOT NULL CHECK (currency_minor_unit BETWEEN 0 AND 4),
 customer_snapshot jsonb NOT NULL CHECK (jsonb_typeof(customer_snapshot)='object'),
 source_tax_snapshot_id uuid NOT NULL,
 source_tax_snapshot_version integer NOT NULL CHECK (source_tax_snapshot_version>0),
 lines_snapshot jsonb NOT NULL CHECK (jsonb_typeof(lines_snapshot)='array' AND jsonb_array_length(lines_snapshot)>0),
 subtotal numeric(24,8) NOT NULL CHECK (subtotal>=0),
 discount_total numeric(24,8) NOT NULL CHECK (discount_total>=0),
 taxable_total numeric(24,8) NOT NULL CHECK (taxable_total>=0),
 tax_total numeric(24,8) NOT NULL CHECK (tax_total>=0),
 grand_total numeric(24,8) NOT NULL CHECK (grand_total>0),
 amount_due numeric(24,8) NOT NULL CHECK (amount_due>=0),
 html_content text NOT NULL CHECK (length(html_content)>0),
 html_sha256 text NOT NULL CHECK (html_sha256 ~ '^[a-f0-9]{64}$'),
 issued_at timestamptz NOT NULL DEFAULT now(),
 issued_by_actor_type text NOT NULL CHECK (issued_by_actor_type IN ('USER','SERVICE','SYSTEM')),
 issued_by_actor_ref text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (tenant_id,original_invoice_id) REFERENCES public.finance_invoices(tenant_id,id) ON DELETE RESTRICT,
 UNIQUE (tenant_id,adjustment_code),
 UNIQUE (tenant_id,id)
);
CREATE TABLE IF NOT EXISTS public.finance_invoice_adjustment_sequences (
 tenant_id uuid NOT NULL REFERENCES public.finance_tenants(id) ON DELETE RESTRICT,
 adjustment_type text NOT NULL CHECK (adjustment_type IN ('CREDIT_NOTE','DEBIT_NOTE')),
 fiscal_year integer NOT NULL CHECK (fiscal_year BETWEEN 2000 AND 9999),
 next_number bigint NOT NULL DEFAULT 1 CHECK (next_number>0),
 PRIMARY KEY (tenant_id,adjustment_type,fiscal_year)
);
CREATE TABLE IF NOT EXISTS public.finance_recurring_invoice_schedules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.finance_tenants(id) ON DELETE RESTRICT,
 customer_id uuid NOT NULL,
 schedule_code text NOT NULL,
 status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE','PAUSED','COMPLETED','CANCELLED')),
 currency_code char(3) NOT NULL REFERENCES public.finance_currencies(code),
 currency_minor_unit smallint NOT NULL CHECK (currency_minor_unit BETWEEN 0 AND 4),
 frequency text NOT NULL CHECK (frequency IN ('WEEKLY','MONTHLY','QUARTERLY','SEMIANNUALLY','ANNUALLY')),
 interval_count smallint NOT NULL DEFAULT 1 CHECK (interval_count BETWEEN 1 AND 24),
 starts_on date NOT NULL,
 ends_on date,
 next_run_on date,
 due_days integer NOT NULL DEFAULT 0 CHECK (due_days BETWEEN 0 AND 365),
 auto_issue boolean NOT NULL DEFAULT false,
 document_metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(document_metadata)='object'),
 notes text,
 created_by_actor_type text NOT NULL CHECK (created_by_actor_type IN ('USER','SERVICE')),
 created_by_actor_ref text NOT NULL,
 updated_by_actor_type text NOT NULL CHECK (updated_by_actor_type IN ('USER','SERVICE','SYSTEM')),
 updated_by_actor_ref text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (tenant_id,id),
 UNIQUE (tenant_id,schedule_code),
 FOREIGN KEY (tenant_id,customer_id) REFERENCES public.finance_customers(tenant_id,id) ON DELETE RESTRICT,
 CHECK (ends_on IS NULL OR ends_on>=starts_on),
 CHECK (next_run_on IS NULL OR next_run_on>=starts_on)
);
CREATE TABLE IF NOT EXISTS public.finance_recurring_invoice_lines (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 schedule_id uuid NOT NULL,
 line_number integer NOT NULL CHECK (line_number BETWEEN 1 AND 500),
 description text NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 500),
 item_code text,
 unit_label text,
 quantity numeric(24,8) NOT NULL CHECK (quantity>0),
 unit_price numeric(24,8) NOT NULL CHECK (unit_price>=0),
 discount_percent numeric(9,6) NOT NULL DEFAULT 0 CHECK (discount_percent BETWEEN 0 AND 100),
 tax_rate_percent numeric(9,6) NOT NULL DEFAULT 0 CHECK (tax_rate_percent BETWEEN 0 AND 100),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (tenant_id,schedule_id,line_number),
 FOREIGN KEY (tenant_id,schedule_id) REFERENCES public.finance_recurring_invoice_schedules(tenant_id,id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS public.finance_recurring_invoice_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 schedule_id uuid NOT NULL,
 scheduled_for date NOT NULL,
 status text NOT NULL CHECK (status IN ('GENERATED','FAILED','SKIPPED')),
 invoice_id uuid,
 idempotency_key text NOT NULL,
 error_code text,
 created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz,
 FOREIGN KEY (tenant_id,schedule_id) REFERENCES public.finance_recurring_invoice_schedules(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY (tenant_id,invoice_id) REFERENCES public.finance_invoices(tenant_id,id) ON DELETE RESTRICT,
 UNIQUE (tenant_id,schedule_id,scheduled_for),
 UNIQUE (tenant_id,idempotency_key),
 CHECK ((status='GENERATED' AND invoice_id IS NOT NULL AND completed_at IS NOT NULL) OR status<>'GENERATED')
);

CREATE OR REPLACE FUNCTION public.finance_guard_invoice_relationship()
RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE a public.finance_invoices%ROWTYPE; b public.finance_invoices%ROWTYPE;
BEGIN
 SELECT * INTO a FROM public.finance_invoices WHERE tenant_id=NEW.tenant_id AND id=NEW.source_invoice_id;
 SELECT * INTO b FROM public.finance_invoices WHERE tenant_id=NEW.tenant_id AND id=NEW.related_invoice_id;
 IF NOT FOUND OR a.id IS NULL OR b.id IS NULL OR a.customer_id<>b.customer_id OR a.currency_code<>b.currency_code THEN
  RAISE EXCEPTION 'INVOICE_RELATIONSHIP_PARTIES_OR_CURRENCY_MISMATCH' USING ERRCODE='23514';
 END IF;
 IF a.status<>'ISSUED' OR b.status<>'ISSUED' THEN
  RAISE EXCEPTION 'INVOICE_RELATIONSHIP_REQUIRES_ISSUED_DOCUMENTS' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS finance_invoice_relationship_guard ON public.finance_invoice_relationships;
CREATE TRIGGER finance_invoice_relationship_guard BEFORE INSERT OR UPDATE ON public.finance_invoice_relationships
 FOR EACH ROW EXECUTE FUNCTION public.finance_guard_invoice_relationship();
CREATE OR REPLACE FUNCTION public.finance_guard_invoice_adjustment()
RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE source public.finance_invoices%ROWTYPE; credited numeric(24,8); debited numeric(24,8);
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'ISSUED_INVOICE_ADJUSTMENT_IMMUTABLE' USING ERRCODE='55000'; END IF;
 SELECT * INTO source FROM public.finance_invoices WHERE tenant_id=NEW.tenant_id AND id=NEW.original_invoice_id FOR UPDATE;
 IF NOT FOUND OR source.status<>'ISSUED' OR source.tax_status<>'CALCULATED'
   OR source.tax_snapshot_id IS DISTINCT FROM NEW.source_tax_snapshot_id
   OR source.tax_snapshot_version IS DISTINCT FROM NEW.source_tax_snapshot_version
   OR source.currency_code<>NEW.currency_code THEN
  RAISE EXCEPTION 'ADJUSTMENT_REQUIRES_MATCHING_ISSUED_TAX_INVOICE' USING ERRCODE='23514';
 END IF;
 SELECT COALESCE(sum(grand_total),0) INTO credited FROM public.finance_invoice_adjustments
  WHERE tenant_id=NEW.tenant_id AND original_invoice_id=NEW.original_invoice_id AND adjustment_type='CREDIT_NOTE';
 SELECT COALESCE(sum(grand_total),0) INTO debited FROM public.finance_invoice_adjustments
  WHERE tenant_id=NEW.tenant_id AND original_invoice_id=NEW.original_invoice_id AND adjustment_type='DEBIT_NOTE';
 IF NEW.adjustment_type='CREDIT_NOTE' AND credited+NEW.grand_total>source.grand_total THEN
  RAISE EXCEPTION 'CREDIT_NOTE_EXCEEDS_REMAINING_INVOICE_VALUE' USING ERRCODE='23514';
 END IF;
 IF NEW.adjustment_type='DEBIT_NOTE' AND debited+NEW.grand_total>source.grand_total THEN
  RAISE EXCEPTION 'DEBIT_NOTE_EXCEEDS_SOURCE_INVOICE_VALUE' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS finance_invoice_adjustment_guard ON public.finance_invoice_adjustments;
CREATE TRIGGER finance_invoice_adjustment_guard BEFORE INSERT OR UPDATE OR DELETE ON public.finance_invoice_adjustments
 FOR EACH ROW EXECUTE FUNCTION public.finance_guard_invoice_adjustment();

DO $rls$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['finance_invoice_relationships','finance_invoice_adjustments','finance_invoice_adjustment_sequences','finance_recurring_invoice_schedules','finance_recurring_invoice_lines','finance_recurring_invoice_runs'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',t||'_tenant_policy',t);
  EXECUTE format('CREATE POLICY %I ON public.%I USING (tenant_id=NULLIF(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (tenant_id=NULLIF(current_setting(''app.tenant_id'',true),'''')::uuid)',t||'_tenant_policy',t);
  EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC',t);
 END LOOP;
END;
$rls$;
DO $grants$
DECLARE t text; r text;
BEGIN
 FOREACH r IN ARRAY ARRAY['finance_runtime','finance_runtime_test'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
   FOREACH t IN ARRAY ARRAY['finance_invoice_relationships','finance_invoice_adjustments','finance_invoice_adjustment_sequences','finance_recurring_invoice_schedules','finance_recurring_invoice_lines','finance_recurring_invoice_runs'] LOOP
    EXECUTE format('GRANT SELECT,INSERT,UPDATE ON TABLE public.%I TO %I',t,r);
   END LOOP;
  END IF;
 END LOOP;
END;
$grants$;
CREATE INDEX IF NOT EXISTS finance_invoice_relationships_source_idx ON public.finance_invoice_relationships(tenant_id,source_invoice_id);
CREATE INDEX IF NOT EXISTS finance_invoice_relationships_related_idx ON public.finance_invoice_relationships(tenant_id,related_invoice_id);
CREATE INDEX IF NOT EXISTS finance_invoice_adjustments_source_idx ON public.finance_invoice_adjustments(tenant_id,original_invoice_id,issued_at);
CREATE INDEX IF NOT EXISTS finance_recurring_schedules_due_idx ON public.finance_recurring_invoice_schedules(tenant_id,next_run_on) WHERE status='ACTIVE';
CREATE INDEX IF NOT EXISTS finance_recurring_runs_invoice_idx ON public.finance_recurring_invoice_runs(tenant_id,invoice_id);
COMMENT ON TABLE public.finance_invoice_relationships IS 'Immutable links between issued advance, balance and replacement invoices.';
COMMENT ON TABLE public.finance_invoice_adjustments IS 'Immutable partial/full credit and debit notes linked to a source issued invoice and its tax snapshot.';
COMMENT ON TABLE public.finance_recurring_invoice_schedules IS 'Tenant-scoped recurring invoice schedules; generation is tracked idempotently per scheduled date.';
