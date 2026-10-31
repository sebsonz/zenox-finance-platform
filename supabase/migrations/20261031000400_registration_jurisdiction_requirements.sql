-- M22 jurisdictional onboarding requirement registry.
-- No legal requirements are seeded by this migration. Only explicitly approved,
-- sourced and time-bounded entries are returned to applicants.
CREATE TABLE IF NOT EXISTS public.finance_registration_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction_code char(2) NOT NULL CHECK (jurisdiction_code ~ '^[A-Z]{2}$'),
  requirement_code text NOT NULL CHECK (requirement_code ~ '^[A-Z][A-Z0-9_.-]{2,79}$'),
  version integer NOT NULL CHECK (version > 0),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 180),
  description text NOT NULL CHECK (length(btrim(description)) BETWEEN 3 AND 2000),
  applies_to_legal_forms text[] NOT NULL DEFAULT ARRAY[]::text[],
  applies_to_entity_types text[] NOT NULL DEFAULT ARRAY['ORGANIZATION']::text[],
  is_required boolean NOT NULL DEFAULT true,
  accepted_document_types text[] NOT NULL DEFAULT ARRAY[]::text[],
  source_authority text NOT NULL CHECK (length(btrim(source_authority)) BETWEEN 2 AND 160),
  source_reference text NOT NULL CHECK (length(btrim(source_reference)) BETWEEN 2 AND 300),
  source_url text,
  source_published_at date,
  source_verified_at date,
  valid_from date NOT NULL,
  valid_to date,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','REVIEWED','APPROVED','RETIRED')),
  reviewed_by text,
  reviewed_at timestamptz,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_registration_requirement_validity CHECK (valid_to IS NULL OR valid_to >= valid_from),
  CONSTRAINT finance_registration_requirement_approval CHECK (
    (status <> 'APPROVED' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL AND source_verified_at IS NOT NULL))
  ),
  CONSTRAINT finance_registration_requirement_version_uq UNIQUE (jurisdiction_code, requirement_code, version)
);
CREATE INDEX IF NOT EXISTS finance_registration_requirements_lookup_idx
  ON public.finance_registration_requirements(jurisdiction_code,status,valid_from,valid_to);
ALTER TABLE public.finance_registration_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_registration_requirements FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.finance_registration_requirements FROM PUBLIC;
DO $revoke$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON TABLE public.finance_registration_requirements FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON TABLE public.finance_registration_requirements FROM authenticated; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN REVOKE ALL ON TABLE public.finance_registration_requirements FROM service_role; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='finance_runtime') THEN REVOKE ALL ON TABLE public.finance_registration_requirements FROM finance_runtime; END IF;
END
$revoke$;

CREATE OR REPLACE FUNCTION public.finance_list_registration_requirements(
  p_jurisdiction_code text,
  p_legal_form text DEFAULT NULL,
  p_entity_type text DEFAULT 'ORGANIZATION',
  p_as_of date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  requirement_id uuid, requirement_code text, version integer, title text,
  description text, is_required boolean, accepted_document_types text[],
  source_authority text, source_reference text, source_url text,
  valid_from date, valid_to date
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public
AS $function$
  SELECT r.id,r.requirement_code,r.version,r.title,r.description,r.is_required,
         r.accepted_document_types,r.source_authority,r.source_reference,r.source_url,
         r.valid_from,r.valid_to
    FROM public.finance_registration_requirements r
   WHERE r.jurisdiction_code=upper(btrim(p_jurisdiction_code))
     AND r.status='APPROVED'
     AND r.valid_from<=coalesce(p_as_of,CURRENT_DATE)
     AND (r.valid_to IS NULL OR r.valid_to>=coalesce(p_as_of,CURRENT_DATE))
     AND (cardinality(r.applies_to_entity_types)=0 OR coalesce(p_entity_type,'ORGANIZATION')=ANY(r.applies_to_entity_types))
     AND (cardinality(r.applies_to_legal_forms)=0 OR upper(coalesce(p_legal_form,''))=ANY(r.applies_to_legal_forms))
   ORDER BY r.is_required DESC,r.requirement_code,r.version DESC
$function$;
REVOKE ALL ON FUNCTION public.finance_list_registration_requirements(text,text,text,date) FROM PUBLIC;
DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
    GRANT EXECUTE ON FUNCTION public.finance_list_registration_requirements(text,text,text,date) TO service_role;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='finance_runtime') THEN
    GRANT EXECUTE ON FUNCTION public.finance_list_registration_requirements(text,text,text,date) TO finance_runtime;
  END IF;
END
$grants$;
COMMENT ON TABLE public.finance_registration_requirements IS
  'Versioned jurisdictional organization-onboarding requirements. No entry is shown to applicants until approved with a verified primary source.';
