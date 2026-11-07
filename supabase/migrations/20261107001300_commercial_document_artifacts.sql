-- Immutable HTML artifacts for sent quotes and issued pro forma documents.
CREATE TABLE IF NOT EXISTS public.finance_commercial_document_artifacts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.finance_tenants(id) ON DELETE RESTRICT,
 document_type text NOT NULL CHECK (document_type IN ('QUOTE','PROFORMA')),
 document_id uuid NOT NULL,
 document_version integer NOT NULL CHECK (document_version>0),
 content_type text NOT NULL DEFAULT 'text/html; charset=utf-8' CHECK (content_type='text/html; charset=utf-8'),
 html_content text NOT NULL CHECK (length(html_content)>0),
 html_sha256 text NOT NULL CHECK (html_sha256 ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (tenant_id,document_type,document_id,document_version)
);
ALTER TABLE public.finance_commercial_document_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_commercial_document_artifacts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS finance_commercial_document_artifacts_tenant_policy ON public.finance_commercial_document_artifacts;
CREATE POLICY finance_commercial_document_artifacts_tenant_policy ON public.finance_commercial_document_artifacts
 USING (tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid)
 WITH CHECK (tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid);
CREATE OR REPLACE FUNCTION public.finance_guard_commercial_document_artifact()
RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE doc_status text; doc_code text;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'COMMERCIAL_DOCUMENT_ARTIFACT_IMMUTABLE' USING ERRCODE='55000'; END IF;
 IF NEW.document_type='QUOTE' THEN
  SELECT status,quote_code INTO doc_status,doc_code FROM public.finance_quotes WHERE tenant_id=NEW.tenant_id AND id=NEW.document_id;
 ELSE
  SELECT status,proforma_code INTO doc_status,doc_code FROM public.finance_proformas WHERE tenant_id=NEW.tenant_id AND id=NEW.document_id;
 END IF;
 IF doc_code IS NULL OR (NEW.document_type='QUOTE' AND doc_status NOT IN ('SENT','ACCEPTED','REJECTED','EXPIRED','CONVERTED'))
   OR (NEW.document_type='PROFORMA' AND doc_status<>'ISSUED') THEN
  RAISE EXCEPTION 'COMMERCIAL_DOCUMENT_NOT_READY_FOR_ARTIFACT' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS finance_commercial_document_artifact_guard ON public.finance_commercial_document_artifacts;
CREATE TRIGGER finance_commercial_document_artifact_guard BEFORE INSERT OR UPDATE OR DELETE ON public.finance_commercial_document_artifacts
 FOR EACH ROW EXECUTE FUNCTION public.finance_guard_commercial_document_artifact();
REVOKE ALL ON FUNCTION public.finance_guard_commercial_document_artifact() FROM PUBLIC;
REVOKE ALL ON TABLE public.finance_commercial_document_artifacts FROM PUBLIC;
DO $grants$
DECLARE r text;
BEGIN
 FOREACH r IN ARRAY ARRAY['finance_runtime','finance_runtime_test'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
   EXECUTE format('GRANT SELECT,INSERT ON TABLE public.finance_commercial_document_artifacts TO %I',r);
  END IF;
 END LOOP;
END;
$grants$;
CREATE INDEX IF NOT EXISTS finance_commercial_document_artifacts_lookup_idx
 ON public.finance_commercial_document_artifacts(tenant_id,document_type,document_id,created_at DESC);
