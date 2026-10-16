-- Invoice draft persistence foundation. Finance database only; never run against ZENOX FRET.
-- Issuing, numbering, credit notes and immutable issued-document lifecycle are separate follow-up migrations.

CREATE TABLE IF NOT EXISTS public.finance_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.finance_tenants(id) ON DELETE RESTRICT,
  invoice_code text,
  customer_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'ISSUED', 'CANCELLED')),
  currency_code char(3) NOT NULL REFERENCES public.finance_currencies(code),
  currency_minor_unit smallint NOT NULL CHECK (currency_minor_unit BETWEEN 0 AND 4),
  issue_date date,
  due_date date,
  customer_snapshot jsonb NOT NULL,
  subtotal numeric(24, 8) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  discount_total numeric(24, 8) NOT NULL DEFAULT 0 CHECK (discount_total >= 0),
  taxable_total numeric(24, 8) NOT NULL DEFAULT 0 CHECK (taxable_total >= 0),
  tax_total numeric(24, 8) NOT NULL DEFAULT 0 CHECK (tax_total >= 0),
  grand_total numeric(24, 8) NOT NULL DEFAULT 0 CHECK (grand_total >= 0),
  calculation_policy text NOT NULL DEFAULT 'LINE_HALF_UP_TAX_EXCLUSIVE_V1',
  notes text,
  created_by_principal_id uuid REFERENCES public.finance_integration_principals(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, invoice_code),
  FOREIGN KEY (tenant_id, customer_id)
    REFERENCES public.finance_customers(tenant_id, id) ON DELETE RESTRICT,
  CHECK (invoice_code IS NULL OR invoice_code ~ '^[A-Z0-9][A-Z0-9/_-]{1,79}$'),
  CHECK (due_date IS NULL OR issue_date IS NULL OR due_date >= issue_date),
  CHECK (jsonb_typeof(customer_snapshot) = 'object'),
  CHECK (status = 'DRAFT' OR (invoice_code IS NOT NULL AND issue_date IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS public.finance_invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  line_number integer NOT NULL CHECK (line_number BETWEEN 1 AND 500),
  description text NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 500),
  quantity numeric(24, 8) NOT NULL CHECK (quantity > 0),
  unit_price numeric(24, 8) NOT NULL CHECK (unit_price >= 0),
  discount_percent numeric(9, 6) NOT NULL CHECK (discount_percent BETWEEN 0 AND 100),
  tax_rate_percent numeric(9, 6) NOT NULL CHECK (tax_rate_percent BETWEEN 0 AND 100),
  subtotal numeric(24, 8) NOT NULL CHECK (subtotal >= 0),
  discount_amount numeric(24, 8) NOT NULL CHECK (discount_amount >= 0),
  taxable_amount numeric(24, 8) NOT NULL CHECK (taxable_amount >= 0),
  tax_amount numeric(24, 8) NOT NULL CHECK (tax_amount >= 0),
  total numeric(24, 8) NOT NULL CHECK (total >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, invoice_id, line_number),
  FOREIGN KEY (tenant_id, invoice_id)
    REFERENCES public.finance_invoices(tenant_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS finance_invoices_tenant_created_idx
  ON public.finance_invoices (tenant_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS finance_invoices_tenant_customer_idx
  ON public.finance_invoices (tenant_id, customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS finance_invoice_lines_tenant_invoice_idx
  ON public.finance_invoice_lines (tenant_id, invoice_id, line_number);

ALTER TABLE public.finance_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_invoices FORCE ROW LEVEL SECURITY;
ALTER TABLE public.finance_invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_invoice_lines FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS finance_invoices_tenant_isolation ON public.finance_invoices;
CREATE POLICY finance_invoices_tenant_isolation ON public.finance_invoices
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS finance_invoice_lines_tenant_isolation ON public.finance_invoice_lines;
CREATE POLICY finance_invoice_lines_tenant_isolation ON public.finance_invoice_lines
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

REVOKE ALL ON TABLE public.finance_invoices, public.finance_invoice_lines FROM PUBLIC;
