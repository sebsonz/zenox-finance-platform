-- Tax assignment evidence reuses the existing private registration-document bucket.
-- The application stores tax evidence metadata separately and scopes every object
-- under <assignment_id>/<uuid>. Do not create a second bucket or alter registration
-- storage policies as part of tax administration.
DO $$
DECLARE
  v_bucket record;
BEGIN
  SELECT id, public, file_size_limit, allowed_mime_types
    INTO v_bucket
    FROM storage.buckets
   WHERE id = 'zenox-registration-documents';

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '55000',
      MESSAGE = 'REQUIRED_PRIVATE_REGISTRATION_DOCUMENT_BUCKET_MISSING';
  END IF;

  IF v_bucket.public IS DISTINCT FROM false
     OR v_bucket.file_size_limit IS NULL
     OR v_bucket.file_size_limit < 10485760
     OR NOT (
       ARRAY['application/pdf', 'image/jpeg', 'image/png']::text[]
       <@ coalesce(v_bucket.allowed_mime_types, ARRAY[]::text[])
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000',
      MESSAGE = 'REGISTRATION_DOCUMENT_BUCKET_CONFIGURATION_INVALID';
  END IF;
END
$$;
