-- Explicit commercial classification for professional invoice lines.
ALTER TABLE public.finance_invoice_lines
 ADD COLUMN IF NOT EXISTS line_type text NOT NULL DEFAULT 'ITEM'
 CHECK (line_type IN ('ITEM','SERVICE','FEE','EXPENSE'));
COMMENT ON COLUMN public.finance_invoice_lines.line_type IS
 'Commercial nature of the invoice line; FEE and EXPENSE are explicit billable additions, not hidden totals.';
