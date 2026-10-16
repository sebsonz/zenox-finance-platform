-- Immutable HTML rendering snapshot for issued invoices.
-- Finance-only additive migration. Never apply to ZENOX FRET V2.

CREATE TABLE IF NOT EXISTS public.finance_invoice_document_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  document_version integer NOT NULL CHECK (document_version > 0),
  document_type text NOT NULL CHECK (document_type IN ('INVOICE')),
  invoice_code text NOT NULL,
  content_type text NOT NULL CHECK (content_type = 'text/html; charset=utf-8'),
  html_content text NOT NULL CHECK (length(html_content) > 0),
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  created_by_principal_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT finance_invoice_document_artifacts_version_uq
    UNIQUE (tenant_id, invoice_id, document_version, document_type),
  CONSTRAINT finance_invoice_document_artifacts_invoice_fk
    FOREIGN KEY (tenant_id, invoice_id)
    REFERENCES public.finance_invoices (tenant_id, id)
    ON DELETE RESTRICT
);

ALTER TABLE public.finance_invoice_document_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_invoice_document_artifacts FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS finance_invoice_document_artifacts_tenant_policy
  ON public.finance_invoice_document_artifacts;
CREATE POLICY finance_invoice_document_artifacts_tenant_policy
  ON public.finance_invoice_document_artifacts
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE OR REPLACE FUNCTION public.finance_reject_invoice_document_artifact_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'ISSUED_INVOICE_DOCUMENT_IMMUTABLE' USING ERRCODE = '55000';
END;
$function$;

DROP TRIGGER IF EXISTS finance_invoice_document_artifact_immutable_guard
  ON public.finance_invoice_document_artifacts;
CREATE TRIGGER finance_invoice_document_artifact_immutable_guard
  BEFORE UPDATE OR DELETE ON public.finance_invoice_document_artifacts
  FOR EACH ROW EXECUTE FUNCTION public.finance_reject_invoice_document_artifact_mutation();

REVOKE ALL ON FUNCTION public.finance_reject_invoice_document_artifact_mutation() FROM PUBLIC;
REVOKE ALL ON TABLE public.finance_invoice_document_artifacts FROM PUBLIC;

DO $grants$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['finance_runtime', 'finance_runtime_test'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('GRANT SELECT, INSERT ON TABLE public.finance_invoice_document_artifacts TO %I', role_name);
      EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.finance_invoice_document_artifacts FROM %I', role_name);
    END IF;
  END LOOP;
END;
$grants$;

CREATE INDEX IF NOT EXISTS finance_invoice_document_artifacts_lookup_idx
  ON public.finance_invoice_document_artifacts (tenant_id, invoice_id, document_version);

COMMENT ON TABLE public.finance_invoice_document_artifacts IS
  'Immutable server-rendered HTML artifact and SHA-256 evidence for an issued invoice revision. PDF rendering/storage is a separate adapter concern.';
