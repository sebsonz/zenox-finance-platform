# Web-to-API Security Boundary

**Status:** Non-production user and machine API slices are implemented. Production approval is not granted.

## Current state

- The React/Vite workspace uses a Supabase Auth session exchange to establish an HttpOnly Finance session cookie.
- The Express backend exposes narrow user-authenticated routes. Tenant-scoped routes resolve the active membership and permission server-side, verify tenant status, and construct a trusted context before calling domain application services.
- M04 customer, contact and address routes support both reads and writes. Writes are limited by server-side permissions; OWNER, ADMIN and FINANCE_MANAGER can manage, while FINANCE_OPERATOR and VIEWER remain read-only. Mutations derive the human actor from the verified identity and membership and write audit events transactionally.
- M04 user-session writes are not the machine integration API. They are narrow same-origin user routes and do not use synthetic integration credentials.
- Organization registration is implemented under `/api/v1/user/registration`; platform registration review is implemented under `/api/v1/user/platform`. These routes use the verified user session, and the database functions enforce the platform-operator allowlist for review.
- Machine-to-machine authentication is separate: client ID, bearer secret digest, required scopes, explicit principal-to-tenant grant, and active tenant are checked before the request context is established.
- The tax form remains non-executing until its secure authoritative calculation flow is implemented.
- These are non-production implementation slices; deployment and production controls remain open.

## Non-negotiable security rules

1. **Never expose service credentials to the browser.** Do not place integration bearer tokens, client secrets, database credentials, or privileged API keys in frontend code, HTML, browser storage, or `VITE_*` environment variables.
2. **Do not call the privileged integration API directly from the browser.** The browser must not set `x-finance-client-id`, `Authorization: Bearer ...`, or an arbitrary trusted `x-finance-tenant-id` using privileged service credentials.
3. **Use a server-side boundary.** Browser operations must use a narrow server-side authenticated route/adapter. It must authenticate the end user and authorize the requested operation for the tenant before accessing application services.
4. **Derive tenant access from trusted membership.** Never trust a tenant ID merely because the browser supplied it. Verify active membership and permission on every protected operation, verify the tenant is active where required, and construct the trusted tenant context server-side.
5. **Keep service-to-service controls.** Use least-privilege scopes, explicit tenant grants, credential rotation, and auditable machine identities for machine integrations.
6. **Protect cookie-based sessions.** Use `Secure`, `HttpOnly`, and appropriate `SameSite` cookies; validate origins for state-changing requests; complete CSRF protections appropriate to the deployment; and apply session expiry and revocation.
7. **Constrain network and request behavior.** Configure explicit CORS allowlists where cross-origin access is needed, rate limits, request-size limits, timeouts, and safe error responses. CORS is not authentication or authorization.
8. **Preserve traceability without leaking secrets.** Correlate operations with request IDs and audit events. Never log bearer tokens, cookies, or secret values.
9. **Keep calculations authoritative on the server.** Tax, invoice totals, payment state, numbering, and accounting effects must be computed and validated by Finance backend services, not trusted from browser-supplied totals.
10. **Do not fabricate business results.** Keep unimplemented workflows unavailable and distinguish non-production slices from production-ready capabilities.

## M04 customer request flow

```text
Browser customer workspace
  -> same-origin request with HttpOnly Finance session cookie
  -> Express user-auth route
       - verify user session
       - validate tenant/customer/query identifiers
       - resolve active tenant membership
       - enforce customers:read or customers:manage
       - verify tenant is active
       - derive actor from verified issuer + subject + membership
       - create trusted tenant context
  -> customer application service
       - tenant-scoped transaction and RLS
       - transactional audit for mutations
  -> minimized customer/contact/address response
```

This is an in-process server-side user adapter, not a generic proxy and not an HTTP call to the machine integration API.

## Acceptance criteria before production

- [x] User session and narrow user routes exist for the customer slice.
- [x] Active tenant membership and M04 read/manage permissions are checked server-side.
- [x] Customer reads and writes use tenant-scoped application services.
- [x] Human actor attribution and transactional audit exist for M04 mutations.
- [x] Registration submission derives identity from the verified session and uses same-origin POST validation.
- [x] Platform review requires an explicitly provisioned PLATFORM_ADMIN and prevents self-review.
- [x] Machine integration auth verifies principal, secret digest, scopes, explicit tenant grant and active tenant.
- [ ] Complete refresh, expiry, revocation, and deployment/proxy validation.
- [ ] Complete CSRF protections and validate Origin/Host behavior behind the actual reverse proxy for all cookie-authenticated state-changing routes.
- [ ] Add/verify rate limits and abuse controls for registration, platform review and user mutation routes.
- [ ] Test cross-tenant denial, insufficient roles, expired/revoked sessions, safe errors, and operational controls for each exposed route.
- [ ] Verify browser bundles and logs contain no credentials or sensitive server configuration.
- [ ] Validate the complete production hosting topology, TLS, trusted proxy configuration and secret management.
- [ ] Keep live financial write operations disabled until their domain-specific controls pass CI and operational review.

## Out of scope

This document does not authorize production deployment, remote migrations, payment processing, or activation of additional user-session write routes.
