-- ZENOX Finance tax administration foundation.
-- Adds configurable jurisdiction levels, tenant assignments, private evidence metadata,
-- delegated tax reviewers, rule publication approvals and platform-level tax audit.
-- Finance database only. Never apply to ZENOX FRET or production without release approval.
-- Access is intentionally closed by FORCE RLS; audited SECURITY DEFINER APIs follow
-- in a separate migration. Migration runner owns transaction boundaries.

-- 1. Configurable jurisdiction hierarchy per country.
CREATE TABLE IF NOT EXISTS public.finance_tax_jurisdiction_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code char(2) NOT NULL,
  level_code text NOT NULL,
  label text NOT NULL,
  parent_level_code text,
  sort_order integer NOT NULL DEFAULT 0,
  is_required boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_tax_jurisdiction_levels_country_code_check
    CHECK (country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT finance_tax_jurisdiction_levels_level_code_check
    CHECK (level_code ~ '^[A-Z][A-Z0-9_]{1,39}$'),
  CONSTRAINT finance_tax_jurisdiction_levels_label_check
    CHECK (length(btrim(label)) BETWEEN 1 AND 100),
  CONSTRAINT finance_tax_jurisdiction_levels_sort_order_check
    CHECK (sort_order BETWEEN 0 AND 10000),
  CONSTRAINT finance_tax_jurisdiction_levels_country_level_key
    UNIQUE (country_code, level_code),
  CONSTRAINT finance_tax_jurisdiction_levels_parent_fk
    FOREIGN KEY (country_code, parent_level_code)
    REFERENCES public.finance_tax_jurisdiction_levels(country_code, level_code)
    DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS finance_tax_jurisdiction_levels_order_idx
  ON public.finance_tax_jurisdiction_levels(country_code, sort_order, level_code)
  WHERE is_active = true;

-- Existing installations had a hard-coded list of levels. Replace it with a
-- stable code constraint so each country can define its own hierarchy.
ALTER TABLE public.finance_tax_jurisdictions
  DROP CONSTRAINT IF EXISTS finance_tax_jurisdictions_jurisdiction_level_check;
ALTER TABLE public.finance_tax_jurisdictions
  ADD CONSTRAINT finance_tax_jurisdictions_level_code_check
  CHECK (jurisdiction_level ~ '^[A-Z][A-Z0-9_]{1,39}$');

CREATE INDEX IF NOT EXISTS finance_tax_jurisdictions_parent_idx
  ON public.finance_tax_jurisdictions(parent_id);

-- 2. Tax jurisdiction assignments. Tenant identity is always server-derived.
CREATE TABLE IF NOT EXISTS public.finance_tenant_tax_jurisdictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.finance_tenants(id) ON DELETE RESTRICT,
  jurisdiction_id uuid NOT NULL REFERENCES public.finance_tax_jurisdictions(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'PENDING_REVIEW'
    CHECK (status IN ('PENDING_REVIEW','ACTIVE','SUSPENDED','EXPIRED','REVOKED')),
  valid_from date NOT NULL,
  valid_to date,
  basis_type text NOT NULL,
  basis_reference text,
  initiated_by text NOT NULL CHECK (initiated_by IN ('TENANT','PLATFORM')),
  requested_by_issuer text NOT NULL,
  requested_by_subject text NOT NULL,
  reviewed_by_issuer text,
  reviewed_by_subject text,
  reviewed_at timestamptz,
  decision_reason text,
  evidence_verified_at timestamptz,
  evidence_verified_by_issuer text,
  evidence_verified_by_subject text,
  activated_at timestamptz,
  suspended_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_tenant_tax_jurisdictions_period_check
    CHECK (valid_to IS NULL OR valid_to >= valid_from),
  CONSTRAINT finance_tenant_tax_jurisdictions_id_tenant_key
    UNIQUE (id, tenant_id),
  CONSTRAINT finance_tenant_tax_jurisdictions_basis_type_check
    CHECK (basis_type ~ '^[A-Z][A-Z0-9_.-]{1,59}$'),
  CONSTRAINT finance_tenant_tax_jurisdictions_basis_reference_check
    CHECK (basis_reference IS NULL OR length(basis_reference) <= 200),
  CONSTRAINT finance_tenant_tax_jurisdictions_requester_check
    CHECK (length(btrim(requested_by_issuer)) BETWEEN 1 AND 500
       AND length(btrim(requested_by_subject)) BETWEEN 1 AND 500),
  CONSTRAINT finance_tenant_tax_jurisdictions_review_pair_check
    CHECK ((reviewed_by_issuer IS NULL) = (reviewed_by_subject IS NULL)),
  CONSTRAINT finance_tenant_tax_jurisdictions_evidence_verifier_pair_check
    CHECK ((evidence_verified_by_issuer IS NULL) = (evidence_verified_by_subject IS NULL)),
  CONSTRAINT finance_tenant_tax_jurisdictions_activation_check
    CHECK (status <> 'ACTIVE' OR
      (reviewed_at IS NOT NULL AND reviewed_by_issuer IS NOT NULL
       AND evidence_verified_at IS NOT NULL AND evidence_verified_by_issuer IS NOT NULL
       AND activated_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS finance_tenant_tax_jurisdictions_tenant_status_idx
  ON public.finance_tenant_tax_jurisdictions(tenant_id, status, valid_from, valid_to);
CREATE INDEX IF NOT EXISTS finance_tenant_tax_jurisdictions_jurisdiction_idx
  ON public.finance_tenant_tax_jurisdictions(jurisdiction_id, status);

-- 3. Evidence metadata uses the existing private registration-document bucket,
-- but tax evidence has its own ownership, lifecycle and review boundary.
CREATE TABLE IF NOT EXISTS public.finance_tax_assignment_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.finance_tenants(id) ON DELETE RESTRICT,
  document_type text NOT NULL
    CHECK (document_type IN ('TAX_REGISTRATION','BUSINESS_REGISTRATION','PROOF_OF_ADDRESS','AUTHORIZATION_LETTER','OTHER')),
  original_filename text NOT NULL CHECK (length(original_filename) BETWEEN 1 AND 180),
  content_type text NOT NULL CHECK (content_type IN ('application/pdf','image/jpeg','image/png')),
  byte_size bigint NOT NULL CHECK (byte_size BETWEEN 1 AND 10485760),
  sha256 char(64) NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  storage_path text NOT NULL UNIQUE,
  uploaded_by_issuer text NOT NULL,
  uploaded_by_subject text NOT NULL,
  status text NOT NULL DEFAULT 'UPLOADED'
    CHECK (status IN ('UPLOADED','VERIFIED','REJECTED','REMOVED')),
  reviewed_at timestamptz,
  reviewed_by_issuer text,
  reviewed_by_subject text,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_tax_assignment_evidence_assignment_tenant_fk
    FOREIGN KEY (assignment_id, tenant_id)
    REFERENCES public.finance_tenant_tax_jurisdictions(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT finance_tax_assignment_evidence_review_pair_check
    CHECK ((reviewed_by_issuer IS NULL) = (reviewed_by_subject IS NULL)),
  CONSTRAINT finance_tax_assignment_evidence_review_state_check
    CHECK (status NOT IN ('VERIFIED','REJECTED') OR
      (reviewed_at IS NOT NULL AND reviewed_by_issuer IS NOT NULL)),
  CONSTRAINT finance_tax_assignment_evidence_note_check
    CHECK (review_note IS NULL OR length(review_note) <= 1000)
);

CREATE INDEX IF NOT EXISTS finance_tax_assignment_evidence_assignment_idx
  ON public.finance_tax_assignment_evidence(assignment_id, created_at, id);

-- 4. Delegated reviewers are scoped by country/jurisdiction and explicit actions.
CREATE TABLE IF NOT EXISTS public.finance_platform_tax_delegations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_issuer text NOT NULL,
  identity_subject text NOT NULL,
  jurisdiction_id uuid REFERENCES public.finance_tax_jurisdictions(id) ON DELETE RESTRICT,
  country_code char(2),
  permissions text[] NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED','REVOKED','EXPIRED')),
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_to timestamptz,
  granted_by_issuer text NOT NULL,
  granted_by_subject text NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_platform_tax_delegations_identity_check
    CHECK (length(btrim(identity_issuer)) BETWEEN 1 AND 500
       AND length(btrim(identity_subject)) BETWEEN 1 AND 500),
  CONSTRAINT finance_platform_tax_delegations_scope_check
    CHECK ((jurisdiction_id IS NOT NULL) <> (country_code IS NOT NULL)),
  CONSTRAINT finance_platform_tax_delegations_country_check
    CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT finance_platform_tax_delegations_permissions_check
    CHECK (cardinality(permissions) > 0
       AND permissions <@ ARRAY['ASSIGNMENT_REVIEW','EVIDENCE_REVIEW','RULE_REVIEW','JURISDICTION_MANAGE']::text[]),
  CONSTRAINT finance_platform_tax_delegations_period_check
    CHECK (valid_to IS NULL OR valid_to > valid_from),
  CONSTRAINT finance_platform_tax_delegations_reason_check
    CHECK (length(btrim(reason)) BETWEEN 10 AND 1000)
);

CREATE INDEX IF NOT EXISTS finance_platform_tax_delegations_identity_idx
  ON public.finance_platform_tax_delegations(identity_issuer, identity_subject, status);

-- 5. Global rule publication requires a recorded approval for the exact rule version.
CREATE TABLE IF NOT EXISTS public.finance_tax_rule_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tax_rule_id uuid NOT NULL REFERENCES public.finance_tax_rules(id) ON DELETE RESTRICT,
  tenant_id uuid REFERENCES public.finance_tenants(id) ON DELETE RESTRICT,
  rule_version integer NOT NULL CHECK (rule_version > 0),
  status text NOT NULL DEFAULT 'PENDING_REVIEW'
    CHECK (status IN ('PENDING_REVIEW','APPROVED','REJECTED','CANCELLED')),
  submitted_by_issuer text NOT NULL,
  submitted_by_subject text NOT NULL,
  reviewed_by_issuer text,
  reviewed_by_subject text,
  reviewed_at timestamptz,
  decision_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_tax_rule_approvals_review_pair_check
    CHECK ((reviewed_by_issuer IS NULL) = (reviewed_by_subject IS NULL)),
  CONSTRAINT finance_tax_rule_approvals_decision_check
    CHECK (status NOT IN ('APPROVED','REJECTED') OR
      (reviewed_at IS NOT NULL AND reviewed_by_issuer IS NOT NULL)),
  CONSTRAINT finance_tax_rule_approvals_reason_check
    CHECK (decision_reason IS NULL OR length(decision_reason) <= 1000),
  CONSTRAINT finance_tax_rule_approvals_rule_version_key
    UNIQUE (tax_rule_id, rule_version)
);

CREATE INDEX IF NOT EXISTS finance_tax_rule_approvals_status_idx
  ON public.finance_tax_rule_approvals(status, created_at DESC);

-- 6. Platform audit is separate from tenant audit because global platform actions
-- must not be falsely attributed to an arbitrary tenant.
CREATE TABLE IF NOT EXISTS public.finance_platform_tax_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_issuer text NOT NULL,
  actor_subject text NOT NULL,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid,
  tenant_id uuid REFERENCES public.finance_tenants(id) ON DELETE RESTRICT,
  correlation_id text NOT NULL,
  reason text,
  safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_platform_tax_audit_actor_check
    CHECK (length(btrim(actor_issuer)) BETWEEN 1 AND 500
       AND length(btrim(actor_subject)) BETWEEN 1 AND 500),
  CONSTRAINT finance_platform_tax_audit_action_check
    CHECK (length(action) BETWEEN 1 AND 120),
  CONSTRAINT finance_platform_tax_audit_resource_check
    CHECK (length(resource_type) BETWEEN 1 AND 120),
  CONSTRAINT finance_platform_tax_audit_correlation_check
    CHECK (length(btrim(correlation_id)) BETWEEN 1 AND 100),
  CONSTRAINT finance_platform_tax_audit_reason_check
    CHECK (reason IS NULL OR length(reason) <= 1000),
  CONSTRAINT finance_platform_tax_audit_metadata_object_check
    CHECK (jsonb_typeof(safe_metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS finance_platform_tax_audit_resource_idx
  ON public.finance_platform_tax_audit_events(resource_type, resource_id, created_at DESC);
CREATE INDEX IF NOT EXISTS finance_platform_tax_audit_tenant_idx
  ON public.finance_platform_tax_audit_events(tenant_id, created_at DESC)
  WHERE tenant_id IS NOT NULL;

-- No direct browser access. SECURITY DEFINER API functions in the next migration
-- will perform identity/operator/delegation checks and write audit atomically.
DO $rls$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'finance_tax_jurisdiction_levels',
    'finance_tenant_tax_jurisdictions',
    'finance_tax_assignment_evidence',
    'finance_platform_tax_delegations',
    'finance_tax_rule_approvals',
    'finance_platform_tax_audit_events'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', t);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', t);
    END IF;
  END LOOP;
END
$rls$;

COMMENT ON TABLE public.finance_tenant_tax_jurisdictions IS
  'Tenant tax jurisdiction assignments. Activation is allowed only through reviewed evidence and authorized approval workflows.';
COMMENT ON TABLE public.finance_tax_assignment_evidence IS
  'Private evidence metadata for tax jurisdiction assignments; objects are stored in the private Finance evidence bucket.';
COMMENT ON TABLE public.finance_platform_tax_delegations IS
  'Time-bounded and explicitly scoped tax administration delegation for platform agents.';
COMMENT ON TABLE public.finance_tax_rule_approvals IS
  'Approval records bound to an exact immutable tax rule version before global publication.';
COMMENT ON TABLE public.finance_platform_tax_audit_events IS
  'Append-only platform-level tax administration audit, separate from tenant-owned audit events.';
