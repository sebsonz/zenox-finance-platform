# User-facing invoice read API

**Status:** Read-only invoice UI connected to the user BFF on the feature branch; not yet production-ready or merged.

## Endpoints

- `GET /api/v1/user/session/config` — returns the configured Supabase URL and public anon key for the login form. The anon key is public project configuration, not a service-role credential.
- `POST /api/v1/user/session` — validates an access token through Supabase Auth and exchanges it for an HttpOnly cookie. Requires a same-host `Origin`.
- `GET /api/v1/user/session` — verifies the cookie-backed session.
- `DELETE /api/v1/user/session` — clears the cookie and requires a same-host `Origin`.
- `GET /api/v1/user/tenants` — returns the active tenant directory for the verified identity through a narrowly scoped database function; the backend role has no direct membership-table SELECT grant.
- `GET /api/v1/user/tenants/:tenantId/invoices` — returns invoices for a specified tenant after server-side membership and permission checks.

The invoice list accepts optional `status` (`DRAFT`, `ISSUED`, or `CANCELLED`), `limit` (1–100, default 25), and `cursor` (invoice UUID). The UI requests up to 50 rows and populates the organization selector from the identity-scoped tenant directory; the backend still re-checks membership and `invoices:read` for each invoice request.

## Session and browser boundary

1. The browser sends credentials only to the configured Supabase Auth password-token endpoint; it does not store the resulting access token in local storage or session storage.
2. The browser exchanges the short-lived access token with the Finance backend. The backend verifies the token through Supabase Auth and sets a `Secure` (in production), `HttpOnly`, `SameSite=Lax` cookie scoped to `/api/v1/user`.
3. Each protected request re-verifies the token with Supabase Auth; the cookie is not treated as proof of tenant membership.
4. Tenant authorization remains separate: resolve active membership from the verified issuer and subject, require `invoices:read`, confirm the tenant is active, then query inside a tenant-scoped transaction under forced RLS.
5. Session exchange and logout reject missing or cross-host Origin headers. Do not expose integration credentials, database URLs, service-role keys, or privileged secrets to the browser.

For local development, Vite proxies `/api` to `http://127.0.0.1:4100` by default; set `FINANCE_API_ORIGIN` to override it. Production must serve the UI and BFF on the same host (or provide a reviewed same-origin reverse-proxy setup). The deployment must use HTTPS so session cookies receive the `Secure` attribute.

## Deliberate scope boundary

This UI is read-only. Draft creation/editing, issuance, document generation, and credit-note actions remain unavailable to user sessions until the write-actor audit model, CSRF protection for state-changing financial operations, and their authorization tests are implemented. Production database provisioning must explicitly grant the private backend role EXECUTE on `finance_list_my_active_tenants()`; no grant is made to PUBLIC or browser roles. Production deployment configuration remains open.

Validate only through GitHub Actions against disposable PostgreSQL. Do not run migrations or test preparation against the live Finance Supabase project, and never use the ZENOX FRET V2 database.
