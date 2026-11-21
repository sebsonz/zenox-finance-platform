# Platform Admin module

## Identity directory — Lot 1

The platform user directory is a read-only administrative capability. Its route is composed under the authenticated user API and is protected by both Supabase token verification and the active platform-operator allowlist.

### Boundaries
- Identity is keyed by the pair (issuer, subject); the current issuer is the configured Supabase project origin.
- Supabase Auth remains the identity source of truth. No duplicate credential or identity table is introduced.
- The directory returns only email, confirmation timestamp, account timestamps/status, platform-operator status and existing Finance tenant memberships.
- Password hashes, access/refresh tokens, MFA secrets, raw user metadata and provider credentials are never selected or returned.
- The SQL function is SECURITY DEFINER with a fixed search_path, verifies the active operator on every call, and is executable only by finance_runtime.
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
7. No database migration is applied as part of this implementation.
