# Platform Admin module

## Identity directory — Lot 1

The platform user directory is a read-only administrative capability. Its route is composed under the authenticated user API and is protected by both Supabase token verification and the active platform-operator allowlist.

### Boundaries
- Identity is keyed by the pair (issuer, subject); the current issuer is the configured Supabase project origin.
- Supabase Auth remains the identity source of truth. No duplicate credential or identity table is introduced.
- The directory returns only email, confirmation timestamp, account timestamps/status, platform-operator status and existing Finance tenant memberships.
- Password hashes, access/refresh tokens, MFA secrets, raw user metadata and provider credentials are never selected or returned.
- The SQL function is SECURITY DEFINER with a fixed search_path, verifies the active operator on every call, and is executable only by the backend database role `postgres` used by the current Supavisor connection.
- Responses are private and non-cacheable. Search is bounded, paginated and parameterized.
- Lot 1 is read-only: no user invitation, suspension, deletion, role assignment or membership mutation. Those workflows belong to later lots with dedicated authorization, audit and approval controls.

### Files
- repository: platform-user-directory.repository.ts
- route: platform-user-directory.routes.ts
- SQL artifact: supabase/migrations/20261121000100_platform_user_identity_directory.sql
- UI: frontend/src/platform/PlatformUserDirectoryWorkspace.tsx

### Acceptance checks
1. Unauthenticated requests receive 401.
2. Authenticated non-operators and suspended operators receive 403.
3. Only an active platform operator can read the directory.
4. Search and page size are bounded and validated.
5. The endpoint never returns secrets or raw Auth metadata.
6. No tenant data is fetched outside the authenticated operator-authorized server function.
7. The migration is applied to DEV only; STAGING and PRODUCTION remain untouched.

## Platform membership and permissions — Lot 2

The platform operator allowlist is extended with a role-permission catalog. The existing `PLATFORM_ADMIN` role is retained as the compatibility Super Admin role and keeps all seeded platform permissions. New roles are deliberately narrower:

- `PLATFORM_SECURITY_ADMIN`: identity directory, operator membership management and platform audit.
- `PLATFORM_ORGANIZATION_ADMIN`: organization directory/lifecycle and registration review.
- `PLATFORM_TAX_ADMIN`: global tax administration.
- `PLATFORM_SUPPORT_READONLY`: dashboard, organization and identity read access only.

Platform role permissions do not replace tenant membership roles or scoped tax delegations. Tax review approvals continue to use `finance_tax_actor_can`, including delegation scope and self-review prevention.

### Security controls

- Role changes require `PLATFORM_MEMBERS_MANAGE`, a confirmed authenticated identity, a same-project Auth subject, a reason and correlation ID.
- Only the compatibility Super Admin can assign Super Admin, organization-admin or tax-admin roles.
- Operators cannot modify their own membership.
- The last active Super Admin cannot be suspended or demoted; the invariant is serialized with a transaction advisory lock.
- Membership mutations are recorded in `finance_platform_audit_events`.
- Browser roles receive no direct table grants; backend calls use SECURITY DEFINER functions.
- No email invitation is claimed or sent by this lot. The UI selects an already registered Auth identity.

### API

- `GET /api/v1/user/platform/members` — list operator memberships; requires `PLATFORM_MEMBERS_MANAGE`.
- `PUT /api/v1/user/platform/members` — create/update role and status; same permission, reason required.
- Existing user directory remains the identity source of truth.

Migration `20261122000100_platform_membership_roles.sql` is source-only until reviewed and explicitly applied to DEV. Do not apply to STAGING or PRODUCTION.
