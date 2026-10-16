-- ZENOX Finance foundation. Finance database only; never run against ZENOX FRET.
-- Transaction boundaries are handled by the migration runner.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.finance_tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_code text NOT NULL UNIQUE,
  legal_name text NOT NULL,
  country_code char(2) NOT NULL,
  default_currency char(3) NOT NULL,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'ACTIVE', 'SUSPENDED', 'DISABLED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (tenant_code ~ '^[A-Z0-9][A-Z0-9_-]{2,39}$'),
  CHECK (country_code ~ '^[A-Z]{2}$'),
  CHECK (default_currency ~ '^[A-Z]{3}$')
);

CREATE TABLE IF NOT EXISTS public.finance_integration_principals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  principal_code text NOT NULL UNIQUE,
  display_name text NOT NULL,
  -- Store a cryptographic hash of a generated secret, never the secret itself.
  credential_hash text NOT NULL,
  allowed_scopes text[] NOT NULL DEFAULT ARRAY[]::text[],
  allowed_tenant_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'REVOKED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  rotated_at timestamptz,
  last_used_at timestamptz,
  CHECK (principal_code ~ '^[a-z0-9][a-z0-9._-]{2,79}$')
);

CREATE TABLE IF NOT EXISTS public.finance_idempotency_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.finance_tenants(id),
  principal_id uuid REFERENCES public.finance_integration_principals(id),
  operation text NOT NULL,
  idempotency_key text NOT NULL,
  request_hash char(64) NOT NULL,
  state text NOT NULL DEFAULT 'IN_PROGRESS'
    CHECK (state IN ('IN_PROGRESS', 'SUCCEEDED', 'FAILED')),
  response_status smallint,
  response_body jsonb,
  resource_type text,
  resource_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  expires_at timestamptz,
  UNIQUE (tenant_id, operation, idempotency_key),
  CHECK (length(idempotency_key) BETWEEN 8 AND 200),
  CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  CHECK (
    (state = 'IN_PROGRESS' AND completed_at IS NULL)
    OR (state <> 'IN_PROGRESS' AND completed_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS finance_idempotency_created_at_idx
  ON public.finance_idempotency_keys (created_at);

CREATE TABLE IF NOT EXISTS public.finance_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.finance_tenants(id),
  actor_type text NOT NULL CHECK (actor_type IN ('USER', 'SERVICE', 'SYSTEM')),
  actor_ref text,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid,
  correlation_id text,
  safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(action) BETWEEN 1 AND 120),
  CHECK (length(resource_type) BETWEEN 1 AND 120)
);

CREATE INDEX IF NOT EXISTS finance_audit_tenant_time_idx
  ON public.finance_audit_events (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS finance_audit_resource_idx
  ON public.finance_audit_events (tenant_id, resource_type, resource_id);

-- RLS is enabled and forced on each tenant-scoped table. No permissive policy
-- is added: access remains closed until a runtime tenant-context mechanism,
-- service role grants, and explicit policies are reviewed and tested.
ALTER TABLE public.finance_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE public.finance_integration_principals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_integration_principals FORCE ROW LEVEL SECURITY;
ALTER TABLE public.finance_idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_idempotency_keys FORCE ROW LEVEL SECURITY;
ALTER TABLE public.finance_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_audit_events FORCE ROW LEVEL SECURITY;
