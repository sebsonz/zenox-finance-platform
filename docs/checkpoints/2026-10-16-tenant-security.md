# Checkpoint — tenant and integration security foundation

Date: 2026-10-16

## Added to main
- Express application composition root and separate server lifecycle.
- Versioned route composition and health/database readiness endpoints.
- Integration principal and tenant repositories.
- Integration authentication middleware requiring client ID, bearer secret, scope, and explicitly assigned active tenant.
- Tenant access policy service and unit tests.
- Strict modular architecture rules.
- CI workflow for typecheck, build and unit tests.
- Decimal invoice calculation engine and initial unit tests.

## Important limitations
- GitHub file writes are confirmed, but no local npm install, TypeScript build, test run, or database migration has been executed in this environment.
- CI result is pending and must be checked after GitHub Actions starts.
- Authentication middleware is not yet mounted on financial routes; no invoice/payment endpoints are exposed yet.
- Database access role, RLS policy strategy and tenant-context propagation must be validated against the dedicated Finance PostgreSQL/Supabase project before production use.
- Integration principal credential enrollment/rotation/revocation workflow is not implemented.
- The initial schema stores allowed tenant IDs in an array; normalize this to a tenant-grant table before the first stable API release.
- Migration runner and schema need integration tests against a disposable Finance database.
- No migration has been run. Do not run these Finance migrations against the ZENOX FRET database.

## Next tasks
1. Normalize principal-to-tenant authorization into a relational grant table.
2. Resolve a least-privilege DB role and RLS strategy, including safe authentication lookup.
3. Add transaction manager with tenant context.
4. Implement customer and currency modules.
5. Implement tax configuration and snapshot model.
6. Implement invoice persistence/lifecycle and API.
7. Implement payment, allocation, and balance model.
8. Add security/integration/concurrency tests and validate CI.
