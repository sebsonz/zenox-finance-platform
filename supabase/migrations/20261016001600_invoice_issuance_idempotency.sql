-- Idempotent invoice issuance request keys. Failed transactions roll reservations back.
CREATE TABLE IF NOT EXISTS public.finance_invoice_issuance_requests (
  tenant_id uuid NOT NULL,
  idempotency_key varchar(128) NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 128),
  invoice_id uuid NOT NULL,
  expected_updated_at timestamptz NOT NULL,
  issued_invoice_code text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  PRIMARY KEY (tenant_id, idempotency_key),
  FOREIGN KEY (tenant_id, invoice_id) REFERENCES public.finance_invoices (tenant_id, id) ON DELETE RESTRICT,
  CHECK ((issued_invoice_code IS NULL AND completed_at IS NULL) OR
         (issued_invoice_code IS NOT NULL AND completed_at IS NOT NULL))
);
ALTER TABLE public.finance_invoice_issuance_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_invoice_issuance_requests FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS finance_invoice_issuance_requests_tenant_policy ON public.finance_invoice_issuance_requests;
CREATE POLICY finance_invoice_issuance_requests_tenant_policy ON public.finance_invoice_issuance_requests
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
REVOKE ALL ON TABLE public.finance_invoice_issuance_requests FROM PUBLIC;
DO $grants$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['finance_runtime', 'finance_runtime_test'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE ON TABLE public.finance_invoice_issuance_requests TO %I', role_name);
      EXECUTE format('REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.finance_invoice_issuance_requests FROM %I', role_name);
    END IF;
  END LOOP;
END;
$grants$;
COMMENT ON TABLE public.finance_invoice_issuance_requests IS
  'Tenant-scoped idempotency records for invoice issuance; key reuse for another invoice or revision is rejected.';
