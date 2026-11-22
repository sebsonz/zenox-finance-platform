-- ZENOX Finance platform membership and permission foundation (Lot 2).
-- Finance database only. Existing PLATFORM_ADMIN operators retain full access.
-- No Auth identities or credentials are duplicated here.

ALTER TABLE public.finance_platform_operators
  DROP CONSTRAINT IF EXISTS finance_platform_operators_role_code_check;

ALTER TABLE public.finance_platform_operators
  ADD CONSTRAINT finance_platform_operators_role_code_check
  CHECK (role_code IN (
    'PLATFORM_ADMIN',
    'PLATFORM_SECURITY_ADMIN',
    'PLATFORM_ORGANIZATION_ADMIN',
    'PLATFORM_TAX_ADMIN',
    'PLATFORM_SUPPORT_READONLY'
  ));

CREATE TABLE IF NOT EXISTS public.finance_platform_permissions (
  permission_code text PRIMARY KEY,
  label text NOT NULL,
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_platform_permissions_code_check
    CHECK (permission_code ~ '^[A-Z][A-Z0-9_]{1,79}$'),
  CONSTRAINT finance_platform_permissions_label_check
    CHECK (length(btrim(label)) BETWEEN 1 AND 120)
);

CREATE TABLE IF NOT EXISTS public.finance_platform_role_permissions (
  role_code text NOT NULL,
  permission_code text NOT NULL REFERENCES public.finance_platform_permissions(permission_code) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role_code, permission_code),
  CONSTRAINT finance_platform_role_permissions_role_check
    CHECK (role_code IN (
      'PLATFORM_ADMIN','PLATFORM_SECURITY_ADMIN','PLATFORM_ORGANIZATION_ADMIN',
      'PLATFORM_TAX_ADMIN','PLATFORM_SUPPORT_READONLY'
    ))
);

CREATE TABLE IF NOT EXISTS public.finance_platform_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_issuer text NOT NULL,
  actor_subject text NOT NULL,
  action text NOT NULL,
  target_issuer text,
  target_subject text,
  previous_role text,
  next_role text,
  previous_status text,
  next_status text,
  reason text NOT NULL,
  correlation_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_platform_audit_reason_check CHECK (length(btrim(reason)) BETWEEN 10 AND 1000),
  CONSTRAINT finance_platform_audit_correlation_check CHECK (length(btrim(correlation_id)) BETWEEN 1 AND 100),
  CONSTRAINT finance_platform_audit_actor_check CHECK (
    length(btrim(actor_issuer)) BETWEEN 1 AND 500 AND length(btrim(actor_subject)) BETWEEN 1 AND 500
  ),
  CONSTRAINT finance_platform_audit_target_pair_check CHECK (
    (target_issuer IS NULL) = (target_subject IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS finance_platform_audit_created_idx
  ON public.finance_platform_audit_events(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS finance_platform_audit_target_idx
  ON public.finance_platform_audit_events(target_issuer, target_subject, created_at DESC);

ALTER TABLE public.finance_platform_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_platform_permissions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.finance_platform_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_platform_role_permissions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.finance_platform_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_platform_audit_events FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.finance_platform_permissions FROM PUBLIC;
REVOKE ALL ON public.finance_platform_role_permissions FROM PUBLIC;
REVOKE ALL ON public.finance_platform_audit_events FROM PUBLIC;

DO $revokes$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON public.finance_platform_permissions FROM anon;
    REVOKE ALL ON public.finance_platform_role_permissions FROM anon;
    REVOKE ALL ON public.finance_platform_audit_events FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON public.finance_platform_permissions FROM authenticated;
    REVOKE ALL ON public.finance_platform_role_permissions FROM authenticated;
    REVOKE ALL ON public.finance_platform_audit_events FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
    REVOKE ALL ON public.finance_platform_permissions FROM service_role;
    REVOKE ALL ON public.finance_platform_role_permissions FROM service_role;
    REVOKE ALL ON public.finance_platform_audit_events FROM service_role;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='finance_runtime') THEN
    REVOKE ALL ON public.finance_platform_permissions FROM finance_runtime;
    REVOKE ALL ON public.finance_platform_role_permissions FROM finance_runtime;
    REVOKE ALL ON public.finance_platform_audit_events FROM finance_runtime;
  END IF;
END
$revokes$;

INSERT INTO public.finance_platform_permissions(permission_code,label,description) VALUES
 ('PLATFORM_DASHBOARD_READ','Lire le tableau de bord','Consulter les indicateurs globaux non sensibles.'),
 ('PLATFORM_USERS_READ','Lire les identités','Consulter le répertoire global des identités.'),
 ('PLATFORM_MEMBERS_MANAGE','Gérer les opérateurs','Créer, suspendre et attribuer les rôles des opérateurs plateforme.'),
 ('PLATFORM_ORGANIZATIONS_READ','Lire les organisations','Consulter le répertoire des organisations.'),
 ('PLATFORM_ORGANIZATIONS_MANAGE','Gérer les organisations','Administrer le cycle de vie des organisations.'),
 ('PLATFORM_REGISTRATIONS_REVIEW','Examiner les inscriptions','Approuver ou rejeter les demandes d’inscription.'),
 ('PLATFORM_TAX_READ','Lire la configuration fiscale','Consulter les règles et juridictions fiscales globales.'),
 ('PLATFORM_TAX_MANAGE','Gérer la configuration fiscale','Créer et soumettre des règles fiscales et gérer les juridictions.'),
 ('PLATFORM_AUDIT_READ','Lire les audits plateforme','Consulter les événements d’audit plateforme.'),
 ('PLATFORM_SETTINGS_MANAGE','Gérer les paramètres','Modifier les paramètres globaux de la plateforme.')
ON CONFLICT(permission_code) DO UPDATE SET
 label=EXCLUDED.label, description=EXCLUDED.description;

-- Compatibility role is intentionally all-powerful until existing operators are
-- explicitly migrated. New roles receive only their named capabilities.
INSERT INTO public.finance_platform_role_permissions(role_code,permission_code)
SELECT 'PLATFORM_ADMIN', permission_code FROM public.finance_platform_permissions
ON CONFLICT DO NOTHING;

INSERT INTO public.finance_platform_role_permissions(role_code,permission_code) VALUES
 ('PLATFORM_SECURITY_ADMIN','PLATFORM_DASHBOARD_READ'),
 ('PLATFORM_SECURITY_ADMIN','PLATFORM_USERS_READ'),
 ('PLATFORM_SECURITY_ADMIN','PLATFORM_MEMBERS_MANAGE'),
 ('PLATFORM_SECURITY_ADMIN','PLATFORM_AUDIT_READ'),
 ('PLATFORM_ORGANIZATION_ADMIN','PLATFORM_DASHBOARD_READ'),
 ('PLATFORM_ORGANIZATION_ADMIN','PLATFORM_ORGANIZATIONS_READ'),
 ('PLATFORM_ORGANIZATION_ADMIN','PLATFORM_ORGANIZATIONS_MANAGE'),
 ('PLATFORM_ORGANIZATION_ADMIN','PLATFORM_REGISTRATIONS_REVIEW'),
 ('PLATFORM_TAX_ADMIN','PLATFORM_DASHBOARD_READ'),
 ('PLATFORM_TAX_ADMIN','PLATFORM_TAX_READ'),
 ('PLATFORM_TAX_ADMIN','PLATFORM_TAX_MANAGE'),
 ('PLATFORM_SUPPORT_READONLY','PLATFORM_DASHBOARD_READ'),
 ('PLATFORM_SUPPORT_READONLY','PLATFORM_ORGANIZATIONS_READ'),
 ('PLATFORM_SUPPORT_READONLY','PLATFORM_USERS_READ')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.finance_platform_actor_can(
  p_identity_issuer text, p_identity_subject text, p_permission text
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public
AS $fn$
  SELECT EXISTS (
    SELECT 1
      FROM public.finance_platform_operators o
      JOIN public.finance_platform_role_permissions rp ON rp.role_code=o.role_code
     WHERE o.identity_issuer=p_identity_issuer
       AND o.identity_subject=p_identity_subject
       AND o.status='ACTIVE'
       AND rp.permission_code=p_permission
  )
$fn$;

-- Global tax reviewer eligibility is deliberately role-aware while preserving
-- time-bounded, jurisdiction-scoped delegated reviewers.
CREATE OR REPLACE FUNCTION public.finance_tax_actor_can(
  p_issuer text, p_subject text, p_permission text, p_jurisdiction_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public
AS $fn$
  SELECT public.finance_platform_actor_can(p_issuer,p_subject,'PLATFORM_TAX_MANAGE')
    OR EXISTS (
      SELECT 1
        FROM public.finance_platform_tax_delegations d
        LEFT JOIN public.finance_tax_jurisdictions j ON j.id=p_jurisdiction_id
       WHERE d.identity_issuer=p_issuer AND d.identity_subject=p_subject
         AND d.status='ACTIVE'
         AND d.valid_from<=now() AND (d.valid_to IS NULL OR d.valid_to>now())
         AND p_permission=ANY(d.permissions)
         AND (
           d.jurisdiction_id=p_jurisdiction_id
           OR (d.country_code IS NOT NULL AND d.country_code=j.country_code)
         )
    )
$fn$;

CREATE OR REPLACE FUNCTION public.finance_list_platform_members(
  p_actor_issuer text,p_actor_subject text
) RETURNS TABLE (
  identity_issuer text, identity_subject text, role_code text, status text,
  created_by_issuer text, created_by_subject text, created_at timestamptz, updated_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public
AS $fn$
BEGIN
  IF NOT public.finance_platform_actor_can(p_actor_issuer,p_actor_subject,'PLATFORM_MEMBERS_MANAGE') THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='PLATFORM_MEMBERS_MANAGE_REQUIRED';
  END IF;
  RETURN QUERY
    SELECT o.identity_issuer,o.identity_subject,o.role_code,o.status,
           o.created_by_issuer,o.created_by_subject,o.created_at,o.updated_at
      FROM public.finance_platform_operators o
     ORDER BY o.created_at,o.identity_issuer,o.identity_subject;
END
$fn$;

CREATE OR REPLACE FUNCTION public.finance_set_platform_member(
  p_actor_issuer text,p_actor_subject text,
  p_target_issuer text,p_target_subject text,
  p_role_code text,p_status text,
  p_reason text,p_correlation_id text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
AS $fn$
DECLARE v_old_role text; v_old_status text; v_is_new boolean;
BEGIN
  IF NOT public.finance_platform_actor_can(p_actor_issuer,p_actor_subject,'PLATFORM_MEMBERS_MANAGE') THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='PLATFORM_MEMBERS_MANAGE_REQUIRED';
  END IF;
  IF p_actor_issuer=p_target_issuer AND p_actor_subject=p_target_subject THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='SELF_MEMBERSHIP_CHANGE_NOT_ALLOWED';
  END IF;
  IF length(btrim(coalesce(p_target_issuer,''))) NOT BETWEEN 1 AND 500
     OR length(btrim(coalesce(p_target_subject,''))) NOT BETWEEN 1 AND 500
     OR p_role_code NOT IN ('PLATFORM_ADMIN','PLATFORM_SECURITY_ADMIN','PLATFORM_ORGANIZATION_ADMIN','PLATFORM_TAX_ADMIN','PLATFORM_SUPPORT_READONLY')
     OR p_status NOT IN ('ACTIVE','SUSPENDED')
     OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 10 AND 1000
     OR length(btrim(coalesce(p_correlation_id,''))) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_PLATFORM_MEMBER_CHANGE';
  END IF;
  IF p_target_issuer<>p_actor_issuer OR NOT EXISTS (
       SELECT 1 FROM auth.users u WHERE u.id::text=p_target_subject\n         AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL\n         AND (u.banned_until IS NULL OR u.banned_until<=now())
     ) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PLATFORM_MEMBER_IDENTITY_NOT_FOUND';
  END IF;
  IF p_role_code IN ('PLATFORM_ADMIN','PLATFORM_ORGANIZATION_ADMIN','PLATFORM_TAX_ADMIN')
     AND NOT public.finance_platform_actor_can(p_actor_issuer,p_actor_subject,'PLATFORM_SETTINGS_MANAGE') THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='PLATFORM_SUPER_ADMIN_REQUIRED';
  END IF;

  -- Serialize every membership mutation so last-admin checks cannot race with
  -- a concurrent grant, demotion or suspension.
  PERFORM pg_advisory_xact_lock(hashtextextended('finance:last-active-platform-admin',0));
  SELECT o.role_code,o.status INTO v_old_role,v_old_status
    FROM public.finance_platform_operators o
   WHERE o.identity_issuer=p_target_issuer AND o.identity_subject=p_target_subject
   FOR UPDATE;
  v_is_new := NOT FOUND;

  IF NOT v_is_new AND v_old_status='ACTIVE'
     AND v_old_role='PLATFORM_ADMIN'
     AND (p_status<>'ACTIVE' OR p_role_code<>'PLATFORM_ADMIN') THEN
    IF (SELECT count(*) FROM public.finance_platform_operators
         WHERE role_code='PLATFORM_ADMIN' AND status='ACTIVE') <= 1 THEN
      RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='LAST_ACTIVE_PLATFORM_ADMIN';
    END IF;
  END IF;

  INSERT INTO public.finance_platform_operators(
    identity_issuer,identity_subject,role_code,status,created_by_issuer,created_by_subject
  ) VALUES (
    p_target_issuer,p_target_subject,p_role_code,p_status,p_actor_issuer,p_actor_subject
  )
  ON CONFLICT(identity_issuer,identity_subject) DO UPDATE SET
    role_code=EXCLUDED.role_code,status=EXCLUDED.status,updated_at=now();

  INSERT INTO public.finance_platform_audit_events(
    actor_issuer,actor_subject,action,target_issuer,target_subject,
    previous_role,next_role,previous_status,next_status,reason,correlation_id
  ) VALUES (
    p_actor_issuer,p_actor_subject,
    CASE WHEN v_is_new THEN 'PLATFORM_MEMBER_CREATED' ELSE 'PLATFORM_MEMBER_UPDATED' END,
    p_target_issuer,p_target_subject,v_old_role,p_role_code,v_old_status,p_status,
    btrim(p_reason),btrim(p_correlation_id)
  );
  RETURN true;
END
$fn$;

REVOKE ALL ON FUNCTION public.finance_platform_actor_can(text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finance_list_platform_members(text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finance_set_platform_member(text,text,text,text,text,text,text,text) FROM PUBLIC;

DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON FUNCTION public.finance_platform_actor_can(text,text,text) FROM anon;
    REVOKE ALL ON FUNCTION public.finance_list_platform_members(text,text) FROM anon;
    REVOKE ALL ON FUNCTION public.finance_set_platform_member(text,text,text,text,text,text,text,text) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON FUNCTION public.finance_platform_actor_can(text,text,text) FROM authenticated;
    REVOKE ALL ON FUNCTION public.finance_list_platform_members(text,text) FROM authenticated;
    REVOKE ALL ON FUNCTION public.finance_set_platform_member(text,text,text,text,text,text,text,text) FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
    GRANT EXECUTE ON FUNCTION public.finance_platform_actor_can(text,text,text) TO service_role;
    GRANT EXECUTE ON FUNCTION public.finance_list_platform_members(text,text) TO service_role;
    GRANT EXECUTE ON FUNCTION public.finance_set_platform_member(text,text,text,text,text,text,text,text) TO service_role;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='finance_runtime') THEN
    GRANT EXECUTE ON FUNCTION public.finance_platform_actor_can(text,text,text) TO finance_runtime;
    GRANT EXECUTE ON FUNCTION public.finance_list_platform_members(text,text) TO finance_runtime;
    GRANT EXECUTE ON FUNCTION public.finance_set_platform_member(text,text,text,text,text,text,text,text) TO finance_runtime;
  END IF;
END
$grants$;

REVOKE UPDATE,DELETE,TRUNCATE ON public.finance_platform_audit_events FROM PUBLIC;
COMMENT ON TABLE public.finance_platform_role_permissions IS
  'Platform-only role grants. Tenant permissions and scoped tax delegations are independent.';
