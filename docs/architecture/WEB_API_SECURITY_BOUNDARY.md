# Web-to-API Security Boundary

**Status:** Architecture contract; implementation of the browser-facing authenticated boundary is not yet complete.

## Current state

- The `web/` application is a demonstration workspace. Its tax form does not execute a real calculation and must continue to say so until a secure authenticated flow exists.
- The Finance API exposes service-to-service endpoints protected by integration credentials, scopes, and tenant grants.
- The current integration authentication is not an end-user login or browser session mechanism.
- The Express API does not currently serve the frontend, and no BFF is claimed to exist.

## Non-negotiable security rules

1. **Never expose service credentials to the browser.** Do not place integration bearer tokens, client secrets, database credentials, or privileged API keys in frontend code, HTML, browser storage, or `VITE_*` environment variables. Vite variables prefixed with `VITE_` are public client-side values.
2. **Do not call the privileged integration API directly from the browser.** The browser must not set `x-finance-client-id`, `Authorization: Bearer ...`, or an arbitrary trusted `x-finance-tenant-id` using privileged service credentials.
3. **Use a server-side boundary.** Before enabling real browser actions, implement either a Backend-for-Frontend (BFF) or an equivalent server-side authenticated adapter. It must authenticate the end user and authorize the requested action for the active tenant before calling the internal Finance API.
4. **Derive tenant access from trusted membership.** Never trust a tenant ID merely because the browser supplied it. The server-side boundary must verify the user's active tenant membership and permissions, then use only a tenant grant assigned to its own integration principal.
5. **Keep service-to-service controls.** Use least-privilege scopes, explicit tenant grants, short operational exposure, credential rotation, and auditable client identities. Do not reuse one broad integration credential across unrelated consumers.
6. **Protect cookie-based sessions if selected.** Use `Secure`, `HttpOnly`, and appropriate `SameSite` cookies; implement CSRF protection for state-changing requests; validate origins; and apply session expiry and revocation.
7. **Constrain network and request behavior.** Configure an explicit CORS allowlist where cross-origin access is needed, rate limits, request-size limits, timeouts, and safe error responses. CORS is not authentication or authorization.
8. **Preserve traceability without leaking secrets.** Correlate browser/BFF/API operations with request IDs and audit events. Never log bearer tokens, cookies, or secret values.
9. **Keep calculations authoritative on the server.** Tax, invoice totals, payment state, numbering, and accounting effects must be computed and validated by Finance backend services, not trusted from browser-supplied totals.
10. **Do not fabricate business results.** Until the authenticated path is implemented and tested, keep demo data clearly identified and real calculation/payment controls disabled or explicitly marked unavailable.

## Target request flow

```text
Browser UI
  -> authenticated user session
  -> BFF / server-side adapter
       - validate session
       - verify user role and active tenant membership
       - validate input and enforce CSRF/origin policy as applicable
       - choose an allowlisted operation
  -> Finance API using server-held integration credentials
       - verify client identity, scope, tenant grant, and tenant status
       - execute within tenant-scoped transaction and RLS
       - return authoritative result
  -> BFF returns a minimized response to the browser
```

The BFF must not become a generic proxy. It should expose specific user-authorized operations and map user identity to tenant permissions on the server.

## Acceptance criteria before enabling live UI operations

- [ ] Decide and document the end-user identity provider and session lifecycle.
- [ ] Implement server-side user-to-tenant membership and role checks.
- [ ] Implement the BFF/adapter with a narrow allowlist of operations.
- [ ] Keep all integration credentials exclusively server-side.
- [ ] Reject unauthenticated requests and unauthorized tenant switching.
- [ ] Test cross-tenant access denial, insufficient roles, expired/revoked sessions, CSRF/origin controls where applicable, and safe error handling.
- [ ] Verify that logs and browser bundles contain no credentials or sensitive server configuration.
- [ ] Verify that Finance calculations and persisted snapshots come from the authoritative backend.
- [ ] Keep the frontend in demo/unavailable mode until these checks pass in CI.

## Out of scope for this document

This document does not implement end-user authentication, a BFF, CORS policy, payment processing, or a deployment. It defines the security boundary that those implementations must satisfy.