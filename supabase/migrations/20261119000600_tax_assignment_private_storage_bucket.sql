-- Provision the dedicated private bucket used by tax-assignment evidence uploads.
-- Objects are accessed only by the backend using the Supabase service role.
-- No browser role receives storage object access.
INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'zenox-tax-assignment-evidence',
  'zenox-tax-assignment-evidence',
  false,
  10485760,
  ARRAY['application/pdf', 'image/jpeg', 'image/png']::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['application/pdf', 'image/jpeg', 'image/png']::text[];

-- Explicitly prevent browser access. Backend Storage requests use the service role.
DROP POLICY IF EXISTS zenox_tax_assignment_evidence_backend_only
  ON storage.objects;
CREATE POLICY zenox_tax_assignment_evidence_backend_only
  ON storage.objects
  FOR ALL
  TO service_role
  USING (bucket_id = 'zenox-tax-assignment-evidence')
  WITH CHECK (bucket_id = 'zenox-tax-assignment-evidence');