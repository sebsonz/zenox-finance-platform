-- Commercial quote and pro-forma aggregates are separate from fiscal invoices.
-- Additive ZENOX Finance migration only. Never apply to ZENOX FRET.
CREATE TABLE IF NOT EXISTS public.finance_quote_sequences (
  tenant_id uuid NOT NULL REFERENCES public.finance_tenants(id) ON DELETE RESTRICT,
  fiscal_year integer NOT NULL CHECK (fiscal_year BETWEEN 2000 AND 9999),
  next_number bigint NOT NULL DEFAULT 1 CHECK (next_number > 0),
  PRIMARY KEY (tenant_id, fiscal_year)
);
CREATE TABLE IF NOT EXISTS public.finance_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.finance_tenants(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL,
  quote_code text,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SENT','ACCEPTED','REJECTED','EXPIRED','CONVERTED','CANCELLED')),
  currency_code char(3) NOT NULL REFERENCES public.finance_currencies(code),
  currency_minor_unit smallint NOT NULL CHECK (currency_minor_unit BETWEEN 0 AND 4),
  issue_date date,
  valid_until date,
  customer_snapshot jsonb NOT NULL CHECK (jsonb_typeof(customer_snapshot)='object'),
  seller_snapshot jsonb NOT NULL CHECK (jsonb_typeof(seller_snapshot)='object'),
  document_metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(document_metadata)='object'),
  notes text,
  subtotal numeric(24,8) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  discount_total numeric(24,8) NOT NULL DEFAULT 0 CHECK (discount_total >= 0),
  taxable_total numeric(24,8) NOT NULL DEFAULT 0 CHECK (taxable_total >= 0),
  estimated_tax_total numeric(24,8) NOT NULL DEFAULT 0 CHECK (estimated_tax_total >= 0),
  grand_total numeric(24,8) NOT NULL DEFAULT 0 CHECK (grand_total >= 0),
  converted_invoice_id uuid,
  accepted_at timestamptz,
  rejected_at timestamptz,
  sent_at timestamptz,
  created_by_actor_type text NOT NULL CHECK (created_by_actor_type IN ('USER','SERVICE')),
  created_by_actor_ref text NOT NULL,
  updated_by_actor_type text NOT NULL CHECK (updated_by_actor_type IN ('USER','SERVICE','SYSTEM')),
  updated_by_actor_ref text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  document_version integer NOT NULL DEFAULT 1 CHECK (document_version > 0),
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,quote_code),
  FOREIGN KEY (tenant_id,customer_id) REFERENCES public.finance_customers(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,converted_invoice_id) REFERENCES public.finance_invoices(tenant_id,id) ON DELETE RESTRICT,
  CHECK (valid_until IS NULL OR issue_date IS NULL OR valid_until >= issue_date),
  CHECK ((status='DRAFT' AND quote_code IS NULL AND issue_date IS NULL) OR status<>'DRAFT'),
  CHECK ((status='CONVERTED' AND converted_invoice_id IS NOT NULL) OR (status<>'CONVERTED' AND converted_invoice_id IS NULL))
);
CREATE TABLE IF NOT EXISTS public.finance_quote_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  quote_id uuid NOT NULL,
  line_number integer NOT NULL CHECK (line_number BETWEEN 1 AND 500),
  description text NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 500),
  item_code text,
  unit_label text,
  line_note text,
  quantity numeric(24,8) NOT NULL CHECK (quantity > 0),
  unit_price numeric(24,8) NOT NULL CHECK (unit_price >= 0),
  discount_percent numeric(9,6) NOT NULL DEFAULT 0 CHECK (discount_percent BETWEEN 0 AND 100),
  indicative_tax_rate numeric(9,6) NOT NULL DEFAULT 0 CHECK (indicative_tax_rate BETWEEN 0 AND 100),
  subtotal numeric(24,8) NOT NULL CHECK (subtotal >= 0),
  discount_amount numeric(24,8) NOT NULL CHECK (discount_amount >= 0),
  taxable_amount numeric(24,8) NOT NULL CHECK (taxable_amount >= 0),
  estimated_tax_amount numeric(24,8) NOT NULL CHECK (estimated_tax_amount >= 0),
  total numeric(24,8) NOT NULL CHECK (total >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,quote_id,line_number),
  FOREIGN KEY (tenant_id,quote_id) REFERENCES public.finance_quotes(tenant_id,id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS public.finance_proforma_sequences (
  tenant_id uuid NOT NULL REFERENCES public.finance_tenants(id) ON DELETE RESTRICT,
  fiscal_year integer NOT NULL CHECK (fiscal_year BETWEEN 2000 AND 9999),
  next_number bigint NOT NULL DEFAULT 1 CHECK (next_number > 0),
  PRIMARY KEY (tenant_id, fiscal_year)
);
CREATE TABLE IF NOT EXISTS public.finance_proformas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.finance_tenants(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL,
  proforma_code text,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ISSUED','CANCELLED')),
  currency_code char(3) NOT NULL REFERENCES public.finance_currencies(code),
  currency_minor_unit smallint NOT NULL CHECK (currency_minor_unit BETWEEN 0 AND 4),
  issue_date date,
  valid_until date,
  customer_snapshot jsonb NOT NULL CHECK (jsonb_typeof(customer_snapshot)='object'),
  seller_snapshot jsonb NOT NULL CHECK (jsonb_typeof(seller_snapshot)='object'),
  document_metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(document_metadata)='object'),
  notes text,
  subtotal numeric(24,8) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  discount_total numeric(24,8) NOT NULL DEFAULT 0 CHECK (discount_total >= 0),
  estimated_tax_total numeric(24,8) NOT NULL DEFAULT 0 CHECK (estimated_tax_total >= 0),
  grand_total numeric(24,8) NOT NULL DEFAULT 0 CHECK (grand_total >= 0),
  created_by_actor_type text NOT NULL CHECK (created_by_actor_type IN ('USER','SERVICE')),
  created_by_actor_ref text NOT NULL,
  updated_by_actor_type text NOT NULL CHECK (updated_by_actor_type IN ('USER','SERVICE','SYSTEM')),
  updated_by_actor_ref text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  document_version integer NOT NULL DEFAULT 1 CHECK (document_version > 0),
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,proforma_code),
  FOREIGN KEY (tenant_id,customer_id) REFERENCES public.finance_customers(tenant_id,id) ON DELETE RESTRICT,
  CHECK (valid_until IS NULL OR issue_date IS NULL OR valid_until >= issue_date),
  CHECK ((status='DRAFT' AND proforma_code IS NULL AND issue_date IS NULL) OR status<>'DRAFT')
);
CREATE TABLE IF NOT EXISTS public.finance_proforma_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  proforma_id uuid NOT NULL,
  line_number integer NOT NULL CHECK (line_number BETWEEN 1 AND 500),
  description text NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 500),
  item_code text,
  unit_label text,
  line_note text,
  quantity numeric(24,8) NOT NULL CHECK (quantity > 0),
  unit_price numeric(24,8) NOT NULL CHECK (unit_price >= 0),
  discount_percent numeric(9,6) NOT NULL DEFAULT 0 CHECK (discount_percent BETWEEN 0 AND 100),
  indicative_tax_rate numeric(9,6) NOT NULL DEFAULT 0 CHECK (indicative_tax_rate BETWEEN 0 AND 100),
  subtotal numeric(24,8) NOT NULL CHECK (subtotal >= 0),
  discount_amount numeric(24,8) NOT NULL CHECK (discount_amount >= 0),
  estimated_tax_amount numeric(24,8) NOT NULL CHECK (estimated_tax_amount >= 0),
  total numeric(24,8) NOT NULL CHECK (total >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,proforma_id,line_number),
  FOREIGN KEY (tenant_id,proforma_id) REFERENCES public.finance_proformas(tenant_id,id) ON DELETE RESTRICT
);

DO $rls$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['finance_quotes','finance_quote_lines','finance_quote_sequences','finance_proformas','finance_proforma_lines','finance_proforma_sequences'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',t||'_tenant_policy',t);
  EXECUTE format('CREATE POLICY %I ON public.%I USING (tenant_id = NULLIF(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'',true),'''')::uuid)',t||'_tenant_policy',t);
  EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC',t);
 END LOOP;
END;
$rls$;
DO $grants$
DECLARE t text; role_name text;
BEGIN
 FOREACH role_name IN ARRAY ARRAY['finance_runtime','finance_runtime_test'] LOOP
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
   FOREACH t IN ARRAY ARRAY['finance_quotes','finance_quote_lines','finance_quote_sequences','finance_proformas','finance_proforma_lines','finance_proforma_sequences'] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON TABLE public.%I TO %I',t,role_name);
   END LOOP;
  END IF;
 END LOOP;
END;
$grants$;
CREATE INDEX IF NOT EXISTS finance_quotes_tenant_status_created_idx ON public.finance_quotes(tenant_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS finance_quote_lines_tenant_quote_idx ON public.finance_quote_lines(tenant_id,quote_id,line_number);
CREATE INDEX IF NOT EXISTS finance_proformas_tenant_status_created_idx ON public.finance_proformas(tenant_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS finance_proforma_lines_tenant_document_idx ON public.finance_proforma_lines(tenant_id,proforma_id,line_number);
COMMENT ON TABLE public.finance_quotes IS 'Commercial quote lifecycle. A quote is not a tax invoice and carries only estimated taxes until conversion.';
COMMENT ON TABLE public.finance_proformas IS 'Separate non-fiscal pro-forma document lifecycle; never receives an invoice tax snapshot or fiscal invoice number.';
