-- Reconcile the tax-administration workflow with the historical tenant assignment table.
-- The historical table and its data remain authoritative; no rows are deleted or rewritten.
-- Finance database only. Review and test before applying to any Supabase environment.

BEGIN;

-- The original 20261108000400 migration created a one-row-per-tenant/jurisdiction
-- configuration record. The reviewed workflow needs immutable request history, so
-- the same table now stores individual requests. Existing rows remain untouched.
ALTER TABLE public.finance_tenant_tax_jurisdictions
  ADD COLUMN IF NOT EXISTS basis_type text,
  ADD COLUMN IF NOT EXISTS basis_reference text,
  ADD COLUMN IF NOT EXISTS initiated_by text,
  ADD COLUMN IF NOT EXISTS requested_by_issuer text,
  ADD COLUMN IF NOT EXISTS requested_by_subject text,
  ADD COLUMN IF NOT EXISTS reviewed_by_issuer text,
  ADD COLUMN IF NOT EXISTS reviewed_by_subject text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS decision_reason text,
  ADD COLUMN IF NOT EXISTS evidence_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS evidence_verified_by_issuer text,
  ADD COLUMN IF NOT EXISTS evidence_verified_by_subject text,
  ADD COLUMN IF NOT EXISTS activated_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz;

-- Drop only the historical one-row-per-jurisdiction uniqueness rule. The
-- partial unique default index is retained, preserving the one-default invariant.
ALTER TABLE public.finance_tenant_tax_jurisdictions
  DROP CONSTRAINT IF EXISTS finance_tenant_tax_jurisdictions_tenant_jurisdiction_uq;

-- The composite FK used by evidence requires an explicit candidate key on
-- (id, tenant_id), which the historical schema did not provide.
DO $constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid='public.finance_tenant_tax_jurisdictions'::regclass
       AND conname='finance_tenant_tax_jurisdictions_id_tenant_key'
  ) THEN
    ALTER TABLE public.finance_tenant_tax_jurisdictions
      ADD CONSTRAINT finance_tenant_tax_jurisdictions_id_tenant_key UNIQUE (id,tenant_id);
  END IF;
END
$constraint$;

ALTER TABLE public.finance_tenant_tax_jurisdictions
  DROP CONSTRAINT IF EXISTS finance_tenant_tax_jurisdictions_status_check,
  DROP CONSTRAINT IF EXISTS finance_tenant_tax_jurisdictions_workflow_status_ck,
  ADD CONSTRAINT finance_tenant_tax_jurisdictions_workflow_status_ck
    CHECK (status IN ('PENDING','PENDING_REVIEW','ACTIVE','SUSPENDED','RETIRED','EXPIRED','REVOKED'));

-- New workflow rows must carry a server-derived requester and a valid basis.
-- Legacy rows are deliberately exempt; this avoids inventing historical actors
-- or evidence for assignments that predate the review workflow.
ALTER TABLE public.finance_tenant_tax_jurisdictions
  DROP CONSTRAINT IF EXISTS finance_tenant_tax_jurisdictions_workflow_request_ck,
  ADD CONSTRAINT finance_tenant_tax_jurisdictions_workflow_request_ck
    CHECK (
      basis_type IS NULL
      OR (
        basis_type ~ '^[A-Z][A-Z0-9_.-]{1,59}$'
        AND initiated_by IN ('TENANT','PLATFORM')
        AND length(btrim(coalesce(requested_by_issuer,''))) BETWEEN 1 AND 500
        AND length(btrim(coalesce(requested_by_subject,''))) BETWEEN 1 AND 500
      )
    ),
  DROP CONSTRAINT IF EXISTS finance_tenant_tax_jurisdictions_workflow_period_ck,
  ADD CONSTRAINT finance_tenant_tax_jurisdictions_workflow_period_ck
    CHECK (valid_to IS NULL OR valid_to >= valid_from),
  DROP CONSTRAINT IF EXISTS finance_tenant_tax_jurisdictions_workflow_activation_ck,
  ADD CONSTRAINT finance_tenant_tax_jurisdictions_workflow_activation_ck
    CHECK (
      status <> 'ACTIVE'
      OR basis_type IS NULL
      OR (
        reviewed_at IS NOT NULL
        AND reviewed_by_issuer IS NOT NULL
        AND reviewed_by_subject IS NOT NULL
        AND evidence_verified_at IS NOT NULL
        AND evidence_verified_by_issuer IS NOT NULL
        AND evidence_verified_by_subject IS NOT NULL
        AND activated_at IS NOT NULL
      )
    );

CREATE INDEX IF NOT EXISTS finance_tenant_tax_jurisdictions_workflow_queue_idx
  ON public.finance_tenant_tax_jurisdictions(status,created_at DESC,id);

-- The historical setter could directly activate a tax assignment without
-- evidence review. Keep its signature for compatibility, but fail closed.
CREATE OR REPLACE FUNCTION public.finance_set_tenant_tax_jurisdiction(
  p_tenant_id uuid,
  p_operator_issuer text,
  p_operator_subject text,
  p_jurisdiction_id uuid,
  p_status text,
  p_is_default_for_invoicing boolean,
  p_tax_registration_type text,
  p_tax_registration_number text,
  p_tax_regime_code text,
  p_valid_from date,
  p_valid_to date,
  p_administrative_note text,
  p_reason text,
  p_correlation_id text
)
RETURNS TABLE (
  assignment_id uuid,
  tenant_id uuid,
  jurisdiction_id uuid,
  status text,
  is_default_for_invoicing boolean,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $function$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE='0A000',
    MESSAGE='LEGACY_TAX_ASSIGNMENT_WRITE_DISABLED',
    DETAIL='Use the reviewed tax assignment request and approval workflow.';
END;
$function$;

COMMENT ON FUNCTION public.finance_set_tenant_tax_jurisdiction(
  uuid,text,text,uuid,text,boolean,text,text,text,date,date,text,text,text
) IS
  'Deprecated fail-closed compatibility stub. Tax assignments must use the evidence and approval workflow.';

COMMENT ON TABLE public.finance_tenant_tax_jurisdictions IS
  'Historical tenant tax assignments plus reviewed tax assignment requests. Legacy rows are preserved; new workflow requests require verified evidence and authorized approval.';

COMMIT;
