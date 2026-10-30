# Checkpoint — M20 Platform Admin / M10 Tax jurisdiction read API

**Date:** 2026-10-30  
**Branch:** `feat/m20-platform-admin-tax-read-api`  
**Base:** `feature/finance-homepage-dashboard`  
**Base SHA:** `6c137c7db0060345b3d73b6120c304f7c7d6a108`  
**Status:** implementation in progress; not merged.

## Scope

Connect the platform administration console's Fiscalité & juridictions section to a protected, read-only API while preserving module ownership.

- M20 Platform Admin owns platform operator authorization and the platform-facing HTTP endpoint.
- M10 Tax owns jurisdiction query validation, persistence access and the application use case.
- M20 calls the M10 application use case through its public module interface; no cross-domain SQL or direct table writes are introduced.
- The new read endpoint is composed by the API v1 aggregator at `GET /api/v1/user/platform/tax/jurisdictions`, preserving the session cookie path `/api/v1/user` without coupling the user-auth module to M20.
- Existing registration review endpoints and the existing platform operator bootstrap process remain unchanged.
- No jurisdiction data is seeded and no country is declared legally supported by this work.

## Security decisions

- User authentication is performed by the existing `requireUserAuth` middleware.
- Platform authorization uses the verified Supabase identity issuer + subject and the existing `finance_is_active_platform_operator` database function.
- Email confirmation is required; email address and tenant membership are not authorization keys.
- The jurisdiction query returns active rows only, with bounded pagination and parameterized filters.
- Browser roles receive no direct table access. The Finance backend runtime receives SELECT only; the existing RLS policy continues to filter active jurisdictions.
- The additive grant migration is intended for disposable PostgreSQL CI and controlled Finance deployment only. It has not been run against any persistent database.

## Files added/changed

- `backend/src/modules/platform-admin/repositories/platform-operator.repository.ts`
- `backend/src/modules/platform-admin/services/platform-admin-access.service.ts`
- `backend/src/modules/platform-admin/routes/platform-admin.routes.ts`
- `backend/src/modules/tax/schemas/tax-jurisdiction-list.schema.ts`
- `backend/src/modules/tax/repositories/tax-jurisdiction.repository.ts`
- `backend/src/modules/tax/application/list-tax-jurisdictions.use-case.ts`
- `backend/src/modules/tax/index.ts` (public M10 application contract)
- `backend/src/routes/v1/index.ts`
- `backend/src/modules/tax/index.ts`
- `backend/tests/unit/platform-admin-tax.routes.test.ts`
- `backend/tests/unit/platform-admin-access.service.test.ts`
- `backend/tests/unit/tax-jurisdiction.repository.test.ts`
- `backend/tests/unit/tax-jurisdiction-list.schema.test.ts`
- `backend/tests/integration/platform-tax-jurisdictions.postgres.test.ts`
- `frontend/src/features/platform-admin/platform-admin-tax-api.ts`
- `frontend/src/features/platform-admin/PlatformTaxJurisdictions.tsx`
- `frontend/src/features/platform-admin/PlatformTaxJurisdictions.css`
- `frontend/src/platform/PlatformAdminDashboard.tsx`
- `docs/api/platform-admin-tax-jurisdictions.md`
- `docs/runbooks/finance-auth-environment-readiness.md`
- `supabase/migrations/20261030000100_platform_tax_jurisdiction_read_grants.sql`

## Validation gates

- Backend typecheck/build.
- Disposable PostgreSQL migration application and drift check.
- Integration proof that the runtime role can read active jurisdictions only and cannot write.
- Proof that browser roles have no direct SELECT grant.
- Unit tests for authentication, operator authorization, filter validation and pagination contract.
- Frontend typecheck/build and platform admin browser verification.

## Explicitly not done

- No PR merge.
- No push from the local Windows workspace.
- No persistent/remote database migration or data modification.
- No access to `zenoxfret_v2`.
- No tax rule creation, activation or legal validation.
