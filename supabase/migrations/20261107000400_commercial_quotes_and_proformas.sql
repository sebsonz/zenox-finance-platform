-- Lot 2 + Lot 3: commercial quotes and pro forma documents.
-- Separate tenant-scoped aggregates; neither is a tax invoice.
-- Additive Finance-only migration. Do not run against ZENOX FRET.
CREATE TABLE public.finance_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.finance_tenants(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL,
  quote_number text,
  status text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','SENT','ACCEPTED','REJECTED','EXPIRED','CONVERTED','CANCELLED')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  currency_code character(3) NOT NULL REFERENCES public.finance_currencies(code),
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  valid_until date,
  customer_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(customer_snapshot) = 'object'),
  issuer_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(issuer_snapshot) = 'object'),
  subtotal numeric(24,8) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  discount_total numeric(24,8) NOT NULL DEFAULT 0 CHECK (discount_total >= 0),
  tax_total numeric(24,8) NOT NULL DEFAULT 0 CHECK (tax_total >= 0),
  grand_total numeric(24,8) NOT NULL DEFAULT 0 CHECK (grand_total >= 0),
  notes text,
  terms text,
  converted_invoice_id uuid,
  sent_at timestamptz,
  accepted_at timestamptz,
  rejected_at timestamptz,
  converted_at timestamptz,
  created_by_actor_type text NOT NULL CHECK (created_by_actor_type IN ('USER','SERVICE')),
  created_by_actor_ref text NOT NULL,
  updated_by_actor_type text NOT NULL CHECK (updated_by_actor_type IN ('USER','SERVICE')),
  updated_by_actor_ref text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, quote_number),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES public.finance_customers(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, converted_invoice_id) REFERENCES public.finance_invoices(tenant_id, id) ON DELETE RESTRICT,
  CHECK (valid_until IS NULL OR valid_until >= issue_date),
  CHECK ((status = 'CONVERTED') = (converted_invoice_id IS NOT NULL))
);
CREATE TABLE public.finance_quote_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  quote_id uuid NOT NULL,
  line_number integer NOT NULL CHECK (line_number > 0),
  description text NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 1000),
  unit text,
  quantity numeric(24,8) NOT NULL CHECK (quantity > 0),
  unit_price numeric(24,8) NOT NULL CHECK (unit_price >= 0),
  discount_percent numeric(9,6) NOT NULL DEFAULT 0 CHECK (discount_percent BETWEEN 0 AND 100),
  tax_rate_percent numeric(9,6) NOT NULL DEFAULT 0 CHECK (tax_rate_percent BETWEEN 0 AND 100),
  subtotal numeric(24,8) NOT NULL,
  discount_amount numeric(24,8) NOT NULL,
  taxable_amount numeric(24,8) NOT NULL,
  tax_amount numeric(24,8) NOT NULL,
  total numeric(24,8) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, quote_id, line_number),
  FOREIGN KEY (tenant_id, quote_id) REFERENCES public.finance_quotes(tenant_id, id) ON DELETE CASCADE
);
CREATE TABLE public.finance_proformas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.finance_tenants(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL,
  proforma_number text,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PUBLISHED','EXPIRED','REPLACED','CANCELLED')),
  currency_code character(3) NOT NULL REFERENCES public.finance_currencies(code),
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  valid_until date,
  customer_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(customer_snapshot) = 'object'),
  issuer_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(issuer_snapshot) = 'object'),
  subtotal numeric(24,8) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  discount_total numeric(24,8) NOT NULL DEFAULT 0 CHECK (discount_total >= 0),
  tax_total numeric(24,8) NOT NULL DEFAULT 0 CHECK (tax_total >= 0),
  grand_total numeric(24,8) NOT NULL DEFAULT 0 CHECK (grand_total >= 0),
  notes text,
  terms text,
  published_at timestamptz,
  replaced_by_id uuid,
  created_by_actor_type text NOT NULL CHECK (created_by_actor_type IN ('USER','SERVICE')),
  created_by_actor_ref text NOT NULL,
  updated_by_actor_type text NOT NULL CHECK (updated_by_actor_type IN ('USER','SERVICE')),
  updated_by_actor_ref text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, proforma_number),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES public.finance_customers(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, replaced_by_id) REFERENCES public.finance_proformas(tenant_id, id) ON DELETE RESTRICT,
  CHECK (valid_until IS NULL OR valid_until >= issue_date),
  CHECK ((status = 'REPLACED') = (replaced_by_id IS NOT NULL))
);
CREATE TABLE public.finance_proforma_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  proforma_id uuid NOT NULL,
  line_number integer NOT NULL CHECK (line_number > 0),
  description text NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 1000),
  unit text,
  quantity numeric(24,8) NOT NULL CHECK (quantity > 0),
  unit_price numeric(24,8) NOT NULL CHECK (unit_price >= 0),
  discount_percent numeric(9,6) NOT NULL DEFAULT 0 CHECK (discount_percent BETWEEN 0 AND 100),
  tax_rate_percent numeric(9,6) NOT NULL DEFAULT 0 CHECK (tax_rate_percent BETWEEN 0 AND 100),
  subtotal numeric(24,8) NOT NULL,
  discount_amount numeric(24,8) NOT NULL,
  taxable_amount numeric(24,8) NOT NULL,
  tax_amount numeric(24,8) NOT NULL,
  total numeric(24,8) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, proforma_id, line_number),
  FOREIGN KEY (tenant_id, proforma_id) REFERENCES public.finance_proformas(tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX finance_quotes_tenant_status_created_idx ON public.finance_quotes(tenant_id, status, created_at DESC);
CREATE INDEX finance_proformas_tenant_status_created_idx ON public.finance_proformas(tenant_id, status, created_at DESC);
CREATE INDEX finance_quote_lines_tenant_quote_idx ON public.finance_quote_lines(tenant_id, quote_id, line_number);
CREATE INDEX finance_proforma_lines_tenant_doc_idx ON public.finance_proforma_lines(tenant_id, proforma_id, line_number);
ALTER TABLE public.finance_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_quotes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.finance_quote_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_quote_lines FORCE ROW LEVEL SECURITY;
ALTER TABLE public.finance_proformas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_proformas FORCE ROW LEVEL SECURITY;
ALTER TABLE public.finance_proforma_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_proforma_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY finance_quotes_tenant_isolation ON public.finance_quotes
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY finance_quote_lines_tenant_isolation ON public.finance_quote_lines
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY finance_proformas_tenant_isolation ON public.finance_proformas
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY finance_proforma_lines_tenant_isolation ON public.finance_proforma_lines
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
