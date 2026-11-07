-- Preserve issued pro forma immutability while linking its conversion to a fiscal invoice draft.
CREATE TABLE IF NOT EXISTS public.finance_proforma_conversions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.finance_tenants(id) ON DELETE RESTRICT,
 proforma_id uuid NOT NULL,
 invoice_id uuid NOT NULL,
 converted_at timestamptz NOT NULL DEFAULT now(),
 converted_by_actor_type text NOT NULL CHECK (converted_by_actor_type IN ('USER','SERVICE','SYSTEM')),
 converted_by_actor_ref text NOT NULL,
 UNIQUE (tenant_id,proforma_id),
 UNIQUE (tenant_id,invoice_id),
 FOREIGN KEY (tenant_id,proforma_id) REFERENCES public.finance_proformas(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY (tenant_id,invoice_id) REFERENCES public.finance_invoices(tenant_id,id) ON DELETE RESTRICT
);
ALTER TABLE public.finance_proforma_conversions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_proforma_conversions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS finance_proforma_conversions_tenant_policy ON public.finance_proforma_conversions;
CREATE POLICY finance_proforma_conversions_tenant_policy ON public.finance_proforma_conversions
 USING (tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid)
 WITH CHECK (tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid);
REVOKE ALL ON TABLE public.finance_proforma_conversions FROM PUBLIC;
DO $grants$
DECLARE r text;
BEGIN
 FOREACH r IN ARRAY ARRAY['finance_runtime','finance_runtime_test'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
   EXECUTE format('GRANT SELECT,INSERT ON TABLE public.finance_proforma_conversions TO %I',r);
  END IF;
 END LOOP;
END;
$grants$;
CREATE INDEX IF NOT EXISTS finance_proforma_conversions_invoice_idx ON public.finance_proforma_conversions(tenant_id,invoice_id);
COMMENT ON TABLE public.finance_proforma_conversions IS 'Immutable link from an issued non-fiscal pro forma to the resulting fiscal invoice draft.';
