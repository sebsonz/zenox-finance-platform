-- User-to-tenant authorization foundation for the Finance BFF.
-- Finance database only; never run against ZENOX FRET.
-- Identity references use issuer + subject instead of a provider-specific FK,
-- so external identity-provider IDs remain stable without storing credentials.

CREATE TABLE IF NOT EXISTS public.finance_user_tenant_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL
    REFERENCES public.finance_tenants(id) ON DELETE RESTRICT,
  identity_issuer text NOT NULL,
  identity_subject text NOT NULL,
  role_code text NOT NULL
    CHECK (role_code IN ('OWNER', 'ADMIN', 'FINANCE_MANAGER', 'FINANCE_OPERATOR', 'VIEWER')),
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'ACTIVE', 'SUSPENDED', 'REVOKED')),
  invited_by text,
  activated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, identity_issuer, identity_subject),
  CHECK (length(identity_issuer) BETWEEN 1 AND 500),
  CHECK (length(identity_subject) BETWEEN 1 AND 500),
  CHECK (identity_issuer = btrim(identity_issuer)),
  CHECK (identity_subject = btrim(identity_subject)),
  CHECK ((status = 'ACTIVE' AND activated_at IS NOT NULL) OR status <> 'ACTIVE')
);

CREATE INDEX IF NOT EXISTS finance_user_memberships_identity_idx
  ON public.finance_user_tenant_memberships (identity_issuer, identity_subject, status);
CREATE INDEX IF NOT EXISTS finance_user_memberships_tenant_role_idx
  ON public.finance_user_tenant_memberships (tenant_id, role_code, status);

ALTER TABLE public.finance_user_tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_user_tenant_memberships FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS finance_user_membership_tenant_isolation
  ON public.finance_user_tenant_memberships;
CREATE POLICY finance_user_membership_tenant_isolation
  ON public.finance_user_tenant_memberships
  FOR ALL
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );

-- Runtime grants are intentionally provisioned explicitly by the deployment
-- process or dedicated membership-administration service. The general Finance
-- runtime role receives no membership table privileges in integration CI.
REVOKE ALL ON TABLE public.finance_user_tenant_memberships FROM PUBLIC;
