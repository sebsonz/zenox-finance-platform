-- ZENOX Finance only — persistent organization-to-tax-jurisdiction assignments.
-- Proposal prepared for review. DO NOT APPLY until the migration is reviewed and
-- explicitly approved by the project owner.
-- Never run this migration against ZENOX FRET V2.
--
-- Design:
--   * One organization may be assigned to multiple tax jurisdictions (MULTI scope).
--   * At most one ACTIVE jurisdiction is the default for invoice issuance.
--   * Tenant users can read only their own assignments through app.tenant_id.
--   * Writes go through a SECURITY DEFINER function that rechecks an active
--     OWNER/ADMIN membership and tenant transaction context.
--   * Every change writes a tenant-scoped audit event. Tax identifiers are
--     deliberately excluded from audit metadata.

CREATE TABLE IF NOT EXISTS public.finance_tenant_tax_jurisdictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL
    REFERENCES public.finance_tenants(id) ON DELETE RESTRICT,
  jurisdiction_id uuid NOT NULL
    REFERENCES public.finance_tax_jurisdictions(id) ON DELETE RESTRICT,

  -- Business registration data is optional: some jurisdictions do not issue
  -- the same kind of tax registration identifier.
  tax_registration_type text,
  tax_registration_number text,
  tax_regime_code text,

  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'ACTIVE', 'SUSPENDED', 'RETIRED')),
  is_default_for_invoicing boolean NOT NULL DEFAULT false,

  valid_from date NOT NULL DEFAULT CURRENT_DATE,
  valid_to date,

  administrative_note text,
  created_by_issuer text,
  created_by_subject text,
  updated_by_issuer text,
  updated_by_subject text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT finance_tenant_tax_jurisdictions_tenant_jurisdiction_uq
    UNIQUE (tenant_id, jurisdiction_id),

  CONSTRAINT finance_tenant_tax_jurisdictions_dates_ck
    CHECK (valid_to IS NULL OR valid_to >= valid_from),

  CONSTRAINT finance_tenant_tax_jurisdictions_default_active_ck
    CHECK (NOT is_default_for_invoicing OR status = 'ACTIVE'),

  CONSTRAINT finance_tenant_tax_jurisdictions_registration_type_ck
    CHECK (
      tax_registration_type IS NULL
      OR length(btrim(tax_registration_type)) BETWEEN 1 AND 60
    ),

  CONSTRAINT finance_tenant_tax_jurisdictions_registration_number_ck
    CHECK (
      tax_registration_number IS NULL
      OR length(btrim(tax_registration_number)) BETWEEN 1 AND 120
    ),

  CONSTRAINT finance_tenant_tax_jurisdictions_regime_code_ck
    CHECK (
      tax_regime_code IS NULL
      OR length(btrim(tax_regime_code)) BETWEEN 1 AND 60
    ),

  CONSTRAINT finance_tenant_tax_jurisdictions_note_ck
    CHECK (administrative_note IS NULL OR length(administrative_note) <= 2000)
);

CREATE INDEX IF NOT EXISTS finance_tenant_tax_jurisdictions_tenant_status_idx
  ON public.finance_tenant_tax_jurisdictions
    (tenant_id, status, valid_from DESC);

CREATE UNIQUE INDEX IF NOT EXISTS finance_tenant_tax_jurisdictions_one_default_uq
  ON public.finance_tenant_tax_jurisdictions (tenant_id)
  WHERE is_default_for_invoicing = true AND status = 'ACTIVE';

ALTER TABLE public.finance_tenant_tax_jurisdictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_tenant_tax_jurisdictions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS finance_tenant_tax_jurisdictions_tenant_read
  ON public.finance_tenant_tax_jurisdictions;

CREATE POLICY finance_tenant_tax_jurisdictions_tenant_read
  ON public.finance_tenant_tax_jurisdictions
  FOR SELECT
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );

-- No direct browser access and no direct INSERT/UPDATE/DELETE grants.
REVOKE ALL ON TABLE public.finance_tenant_tax_jurisdictions
  FROM PUBLIC, anon, authenticated, service_role;

DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
    GRANT SELECT ON TABLE public.finance_tenant_tax_jurisdictions TO postgres;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finance_runtime') THEN
    GRANT SELECT ON TABLE public.finance_tenant_tax_jurisdictions TO finance_runtime;
  END IF;
END
$grants$;

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
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_assignment_id uuid;
  v_updated_at timestamptz;
  v_reason text;
  v_current_tenant uuid;
BEGIN
  v_current_tenant :=
    NULLIF(current_setting('app.tenant_id', true), '')::uuid;

  IF p_tenant_id IS NULL OR v_current_tenant IS DISTINCT FROM p_tenant_id THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'TENANT_CONTEXT_MISMATCH';
  END IF;

  IF p_operator_issuer IS NULL OR length(btrim(p_operator_issuer)) NOT BETWEEN 1 AND 500
     OR p_operator_subject IS NULL OR length(btrim(p_operator_subject)) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_OPERATOR_IDENTITY';
  END IF;

  IF p_jurisdiction_id IS NULL
     OR p_status IS NULL
     OR p_status NOT IN ('PENDING', 'ACTIVE', 'SUSPENDED', 'RETIRED')
     OR p_is_default_for_invoicing IS NULL
     OR p_valid_from IS NULL
     OR (p_valid_to IS NOT NULL AND p_valid_to < p_valid_from) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_TAX_JURISDICTION_ASSIGNMENT';
  END IF;

  IF p_is_default_for_invoicing AND p_status <> 'ACTIVE' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'DEFAULT_JURISDICTION_MUST_BE_ACTIVE';
  END IF;

  -- A default jurisdiction must be effective on the date of assignment.
  -- Future-dated or already-expired assignments may exist, but cannot be
  -- selected as the current invoice-issuance jurisdiction.
  IF p_is_default_for_invoicing
     AND (p_valid_from > CURRENT_DATE
          OR (p_valid_to IS NOT NULL AND p_valid_to < CURRENT_DATE)) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'DEFAULT_JURISDICTION_NOT_EFFECTIVE_TODAY';
  END IF;

  v_reason := btrim(coalesce(p_reason, ''));
  IF length(v_reason) NOT BETWEEN 10 AND 1000
     OR p_correlation_id IS NULL
     OR length(btrim(p_correlation_id)) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_TAX_ASSIGNMENT_AUDIT_CONTEXT';
  END IF;

  -- Only active organization owners and administrators may manage fiscal setup.
  PERFORM 1
    FROM public.finance_user_tenant_memberships AS m
   WHERE m.tenant_id = p_tenant_id
     AND m.identity_issuer = btrim(p_operator_issuer)
     AND m.identity_subject = btrim(p_operator_subject)
     AND m.status = 'ACTIVE'
     AND m.role_code IN ('OWNER', 'ADMIN')
   FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'TENANT_ADMIN_REQUIRED';
  END IF;

  -- A disabled jurisdiction cannot be newly assigned or activated.
  PERFORM 1
    FROM public.finance_tax_jurisdictions AS j
   WHERE j.id = p_jurisdiction_id
     AND (j.is_active = true OR p_status IN ('SUSPENDED', 'RETIRED'));

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'TAX_JURISDICTION_NOT_ACTIVE';
  END IF;

  -- Serialize default changes for this tenant before changing the default.
  PERFORM 1
    FROM public.finance_tenants AS t
   WHERE t.id = p_tenant_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'ORGANIZATION_NOT_FOUND';
  END IF;

  IF p_is_default_for_invoicing THEN
    UPDATE public.finance_tenant_tax_jurisdictions
       SET is_default_for_invoicing = false,
           updated_at = now(),
           updated_by_issuer = btrim(p_operator_issuer),
           updated_by_subject = btrim(p_operator_subject)
     WHERE tenant_id = p_tenant_id
       AND is_default_for_invoicing = true
       AND jurisdiction_id <> p_jurisdiction_id;
  END IF;

  INSERT INTO public.finance_tenant_tax_jurisdictions (
    tenant_id,
    jurisdiction_id,
    tax_registration_type,
    tax_registration_number,
    tax_regime_code,
    status,
    is_default_for_invoicing,
    valid_from,
    valid_to,
    administrative_note,
    created_by_issuer,
    created_by_subject,
    updated_by_issuer,
    updated_by_subject
  )
  VALUES (
    p_tenant_id,
    p_jurisdiction_id,
    nullif(btrim(p_tax_registration_type), ''),
    nullif(btrim(p_tax_registration_number), ''),
    nullif(btrim(p_tax_regime_code), ''),
    p_status,
    p_is_default_for_invoicing,
    p_valid_from,
    p_valid_to,
    nullif(btrim(p_administrative_note), ''),
    btrim(p_operator_issuer),
    btrim(p_operator_subject),
    btrim(p_operator_issuer),
    btrim(p_operator_subject)
  )
  ON CONFLICT (tenant_id, jurisdiction_id)
  DO UPDATE SET
    tax_registration_type = EXCLUDED.tax_registration_type,
    tax_registration_number = EXCLUDED.tax_registration_number,
    tax_regime_code = EXCLUDED.tax_regime_code,
    status = EXCLUDED.status,
    is_default_for_invoicing = EXCLUDED.is_default_for_invoicing,
    valid_from = EXCLUDED.valid_from,
    valid_to = EXCLUDED.valid_to,
    administrative_note = EXCLUDED.administrative_note,
    updated_by_issuer = EXCLUDED.updated_by_issuer,
    updated_by_subject = EXCLUDED.updated_by_subject,
    updated_at = now()
  RETURNING id, finance_tenant_tax_jurisdictions.updated_at
       INTO v_assignment_id, v_updated_at;

  INSERT INTO public.finance_audit_events (
    tenant_id,
    actor_type,
    actor_ref,
    action,
    resource_type,
    resource_id,
    correlation_id,
    safe_metadata
  )
  VALUES (
    p_tenant_id,
    'USER',
    btrim(p_operator_issuer) || '|' || btrim(p_operator_subject),
    'TENANT_TAX_JURISDICTION_ASSIGNMENT_UPDATED',
    'TENANT_TAX_JURISDICTION',
    v_assignment_id,
    btrim(p_correlation_id),
    jsonb_build_object(
      'jurisdictionId', p_jurisdiction_id,
      'status', p_status,
      'isDefaultForInvoicing', p_is_default_for_invoicing,
      'validFrom', p_valid_from,
      'validTo', p_valid_to,
      'reason', v_reason
    )
  );

  RETURN QUERY
  SELECT v_assignment_id, p_tenant_id, p_jurisdiction_id,
         p_status, p_is_default_for_invoicing, v_updated_at;
END;
$function$;

REVOKE ALL ON FUNCTION public.finance_set_tenant_tax_jurisdiction(
  uuid, text, text, uuid, text, boolean, text, text, text, date, date, text, text, text
) FROM PUBLIC, anon, authenticated, service_role;

DO $function_grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
    GRANT EXECUTE ON FUNCTION public.finance_set_tenant_tax_jurisdiction(
      uuid, text, text, uuid, text, boolean, text, text, text, date, date, text, text, text
    ) TO postgres;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finance_runtime') THEN
    GRANT EXECUTE ON FUNCTION public.finance_set_tenant_tax_jurisdiction(
      uuid, text, text, uuid, text, boolean, text, text, text, date, date, text, text, text
    ) TO finance_runtime;
  END IF;
END
$function_grants$;

COMMENT ON TABLE public.finance_tenant_tax_jurisdictions IS
  'Tenant-owned tax jurisdiction assignments. One tenant may operate in multiple jurisdictions; only one ACTIVE assignment may be the default for invoice issuance.';

COMMENT ON FUNCTION public.finance_set_tenant_tax_jurisdiction(
  uuid, text, text, uuid, text, boolean, text, text, text, date, date, text, text, text
) IS
  'Creates or updates a tenant tax jurisdiction assignment for an active OWNER/ADMIN in the current tenant context; writes an audit event and never writes global tax rules.';
