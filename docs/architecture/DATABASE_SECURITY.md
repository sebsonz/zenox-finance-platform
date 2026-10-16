# Database security and tenant context

## Private control plane

The following tables are control-plane records needed before a tenant context exists:
- `finance_tenants` (active-tenant lookup only)
- `finance_integration_principals` (service credential metadata)
- `finance_integration_tenant_grants` (principal-to-tenant authorization)

They are not browser-accessible. The migration removes RLS from these minimal control-plane tables because the authentication lookup must run before a tenant has been established. Access is instead limited by PostgreSQL table grants: the deployment must grant the backend's dedicated database role only the required privileges. Never grant these tables to browser-facing `anon`/`authenticated` roles or to a public API role. Secrets are stored only as SHA-256 digests of high-entropy random credentials.

Tenant business data (idempotency records, audit events, invoices, payments and related records) remains tenant-scoped and must use RLS with FORCE RLS and explicit policies. Do not add broad policies to make the app work.

## Transaction-local tenant scope

Use `withTenantTransaction(tenantId, work)` for tenant-scoped database work. It validates the tenant UUID and sets `app.tenant_id` with transaction-local `set_config(..., true)`. RLS policies should compare each row's tenant key against `current_setting('app.tenant_id', true)::uuid`, handling missing/invalid context as deny-by-default. Do not use session-level `SET`, since pooled connections are reused.

The transaction helper is infrastructure only: it does not authorize a tenant. Callers must first authenticate the service principal, verify scope, and verify the principal-to-tenant grant. RLS policies and integration tests are still required before protected financial routes are exposed.

## Deployment role provisioning

Use a dedicated non-superuser backend login role. Grant it only the required control-plane SELECT permissions and narrowly scoped write/read permissions for modules as they are introduced. Do not use a superuser or a role with BYPASSRLS for ordinary API traffic. Keep database credentials server-side and outside source control.
