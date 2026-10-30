# Web-to-API Security Boundary

**Status:** Partially implemented for non-production, read-only user workflows. Production approval is not granted.

## Current state

- The React/Vite workspace uses a Supabase Auth session exchange to establish an HttpOnly Finance session cookie.
- The Express backend exposes narrow user-authenticated routes. The M04 customer adapter is implemented in-process: it validates the user session, resolves active tenant membership and permission, checks tenant status, then calls the public customer application services directly using a trusted read context.
- This customer adapter does **not** call the integration API over HTTP and does not use a synthetic integration credential. Machine-to-machine integration routes remain separately protected by integration credentials, scopes, and tenant grants.
- The M04 browser workspace is read-only: customer, contact, and address reads only. No user-session writes are exposed.
- The tax form remains non-executing until its secure authoritative calculation flow is implemented.
- This is a non-production implementation slice; deployment and production controls remain open.

## Non-negotiable security rules

1. **Never expose service credentials to the browser.** Do not place integration bearer tokens, client secrets, database credentials, or privileged API keys in frontend code, HTML, browser storage, or `VITE_*` environment variables.
2. **Do not call the privileged integration API directly from the browser.** The browser must not set `x-finance-client-id`, `Authorization: Bearer ...`, or an arbitrary trusted `x-finance-tenant-id` using privileged service credentials.
3. **Use a server-side boundary.** Browser operations must use a narrow server-side authenticated route/adapter. It must authenticate the end user and authorize the requested operation for the tenant before accessing application services.
4. **Derive tenant access from trusted membership.** Never trust a tenant ID merely because the browser supplied it. Verify active membership and permission on every protected operation, verify the tenant is active, and construct the trusted tenant context server-side.
5. **Keep service-to-service controls.** Use least-privilege scopes, explicit tenant grants, credential rotation, and auditable machine identities for machine integrations.
6. **Protect cookie-based sessions.** Use `Secure`, `HttpOnly`, and appropriate `SameSite` cookies; implement CSRF protection for state-changing requests; validate origins; and apply session expiry and revocation.
7. **Constrain network and request behavior.** Configure explicit CORS allowlists where cross-origin access is needed, rate limits, request-size limits, timeouts, and safe error responses. CORS is not authentication or authorization.
8. **Preserve traceability without leaking secrets.** Correlate operations with request IDs and audit events. Never log bearer tokens, cookies, or secret values.
9. **Keep calculations authoritative on the server.** Tax, invoice totals, payment state, numbering, and accounting effects must be computed and validated by Finance backend services, not trusted from browser-supplied totals.
10. **Do not fabricate business results.** Keep unimplemented workflows unavailable and distinguish non-production slices from production-ready capabilities.

## Current M04 request flow

```text
Browser customer workspace
  -> same-origin request with HttpOnly Finance session cookie
  -> Express user-auth route
       - verify user session
       - validate tenant/customer/query identifiers
       - resolve active tenant membership
       - enforce customers:read permission
       - verify tenant is active
       - create trusted tenant read context
  -> public customer application service
       - tenant-scoped transaction and RLS
  -> minimized customer/contact/address response
```

This is an in-process server-side adapter, not a generic proxy and not an HTTP call to the machine integration API.

## Acceptance criteria before enabling user writes or production

- [x] User session and narrow read-only user route exist for the customer slice.
- [x] Active tenant membership and `customers:read` permission are checked server-side.
- [x] Customer reads use tenant-scoped transactions; integration credentials remain server-side.
- [ ] Complete refresh, expiry, revocation, and deployment/proxy validation.
- [ ] Complete CSRF/origin controls and rate limits before any state-changing user route.
- [ ] Define and test end-user actor identity and audit semantics for customer writes.
- [ ] Test cross-tenant denial, insufficient roles, expired/revoked sessions, safe errors, and operational controls for each new route.
- [ ] Verify browser bundles and logs contain no credentials or sensitive server configuration.
- [ ] Validate the complete production hosting topology and secret management.
- [ ] Keep live financial write operations disabled until their domain-specific controls pass CI.

## Out of scope

This document does not authorize production deployment, remote migrations, payment processing, or user-session write routes.
