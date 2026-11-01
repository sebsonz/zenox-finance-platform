-- Private registration evidence metadata for ZENOX Finance only.
-- Never apply to ZENOX FRET V2. Storage objects are private and served only by
-- the authenticated Finance backend after identity-scoped ownership checks.

CREATE TABLE IF NOT EXISTS public.finance_registration_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id uuid NOT NULL REFERENCES public.finance_registration_drafts(id) ON DELETE RESTRICT,
  identity_issuer text NOT NULL,
  identity_subject text NOT NULL,
  document_type text NOT NULL CHECK (document_type IN ('BUSINESS_REGISTRATION','TAX_REGISTRATION','IDENTITY_DOCUMENT','PROOF_OF_ADDRESS','AUTHORIZATION_LETTER','OTHER')),
  original_filename text NOT NULL CHECK (length(original_filename) BETWEEN 1 AND 180),
  content_type text NOT NULL CHECK (content_type IN ('application/pdf','image/jpeg','image/png')),
  byte_size bigint NOT NULL CHECK (byte_size BETWEEN 1 AND 10485760),
  sha256 char(64) NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  storage_path text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'UPLOADED' CHECK (status IN ('UPLOADED','ACCEPTED','REJECTED','REMOVED')),
  reviewed_at timestamptz,
  reviewed_by text,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (identity_issuer = btrim(identity_issuer)),
  CHECK (identity_subject = btrim(identity_subject)),
  CHECK (length(identity_issuer) BETWEEN 1 AND 500),
  CHECK (length(identity_subject) BETWEEN 1 AND 500),
  CHECK (review_note IS NULL OR length(review_note) <= 1000)
);
CREATE INDEX IF NOT EXISTS finance_registration_documents_draft_idx
  ON public.finance_registration_documents(draft_id, created_at, id);
ALTER TABLE public.finance_registration_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_registration_documents FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.finance_registration_documents FROM PUBLIC;
DO $revokes$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON TABLE public.finance_registration_documents FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON TABLE public.finance_registration_documents FROM authenticated; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN REVOKE ALL ON TABLE public.finance_registration_documents FROM service_role; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finance_runtime') THEN REVOKE ALL ON TABLE public.finance_registration_documents FROM finance_runtime; END IF;
END
$revokes$;
-- Supabase provides storage.buckets. Plain PostgreSQL CI does not, so keep the
-- schema migration testable there while still provisioning the private bucket on Supabase.
DO $bucket$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('zenox-registration-documents','zenox-registration-documents',false,10485760,ARRAY['application/pdf','image/jpeg','image/png']::text[])
    ON CONFLICT (id) DO UPDATE SET public=false,file_size_limit=10485760,allowed_mime_types=ARRAY['application/pdf','image/jpeg','image/png']::text[];
  END IF;
END
$bucket$;
COMMENT ON TABLE public.finance_registration_documents IS
  'Private onboarding evidence metadata. Browser-facing roles have no direct access.';
