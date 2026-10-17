# ADR-0002: User Identity and Backend-for-Frontend

- **Status:** Proposed implementation decision; not yet implemented
- **Date:** 2026-10-16
- **Scope:** ZENOX Finance web workspace and Finance API

## Context

The Finance API currently authenticates machine integrations using `x-finance-client-id`, a bearer credential, scopes, and tenant grants. This is suitable for trusted service-to-service calls, not direct browser use or end-user identity. The React/Vite web workspace is currently a demonstration UI and does not have a login/session implementation.

The product needs a secure path for a human user to access Finance data for an authorized tenant without exposing service credentials or bypassing the API's tenant boundary.

## Decision

Use a **server-side BFF boundary** for all authenticated browser operations. Keep the Finance API's integration-auth mechanism as a separate machine-to-machine security layer.

For the initial user identity provider, evaluate **Supabase Auth** as the preferred candidate because the project already targets Supabase-hosted PostgreSQL. Do not treat this candidate as approved for production until the implementation spike confirms the exact JWT verification, issuer/audience configuration, key rotation behavior, session lifecycle, and deployment topology.

The BFF must:

1. Validate user identity server-side using the selected provider's supported verification mechanism. Never trust a decoded but unverified JWT.
2. Resolve active Finance tenant membership and role from authoritative server-side data.
3. Reject requests where the user lacks membership, the tenant is inactive, or the requested action is not allowed.
4. Call Finance API operations using server-held integration credentials with least-privilege scopes and explicit tenant grants.
5. Keep machine credentials, database URLs, provider secrets, and privileged keys out of the browser bundle, local storage, and `VITE_*` variables.
6. Use narrowly defined routes, input schemas, safe errors, request correlation, rate limits, and audit events. Do not implement a generic API proxy.
7. If cookie sessions are used, set `Secure`, `HttpOnly`, and appropriate `SameSite`; protect state-changing routes against CSRF and validate expected origins.
8. Return only the fields needed by the UI and never trust client-supplied totals, tax amounts, invoice states, or tenant permissions.

## Identity and authorization are distinct

A valid identity-provider session proves who the user is; it does not prove which Finance tenant they may access or what actions they may perform. Tenant membership and role checks remain mandatory on every protected operation. The integration principal must independently be authorized for the target tenant by Finance API controls.

## Rejected approaches

- **Direct browser-to-Finance API using a service token:** rejected because the token would be exposed to users and browser tooling.
- **Trusting `x-finance-tenant-id` from the browser as authorization:** rejected because tenant selection is not proof of tenant membership.
- **Using frontend-only route guards as security:** rejected because browser checks can be bypassed.
- **Building custom password storage/authentication from scratch:** rejected for the initial milestone; it increases security and maintenance burden without a product requirement.
- **Enabling real tax or invoice UI actions before the authenticated server boundary exists:** rejected.

## Implementation sequence

1. Verify Supabase Auth project settings and supported server-side token verification approach.
2. Define the tenant-membership and role model, including how user identity maps to a Finance tenant.
3. Implement and test the BFF/session boundary independently of the demo UI.
4. Add authorization tests for unauthenticated users, invalid/expired tokens, inactive users/tenants, insufficient roles, and cross-tenant attempts.
5. Add a narrow first read-only endpoint before enabling financial writes.
6. Connect the UI only after CI validates the boundary and secrets are verified absent from the browser bundle.

## Consequences

- The browser never receives service-to-service credentials.
- User authentication and integration authentication remain separate layers.
- The initial implementation is not provider-agnostic at the session edge, but the Finance API remains independent of the chosen identity provider.
- No user-authenticated BFF or production-ready login is claimed by this ADR; those remain implementation tasks.

## Open validation items

- Confirm the Supabase Auth project URL, JWT issuer/audience, and signing-key verification method from actual project configuration; do not guess these values.
- Decide whether browser sessions are cookie-based through the BFF or use another explicitly reviewed secure pattern.
- Define tenant membership source and roles before authorizing real financial data.
- Confirm production deployment topology and secret management before release.
## Implementation spike update — 2026-10-17

A first non-production implementation slice now exists on the unmerged `feature/invoice-user-readonly-bff` branch:

- The backend can exchange a Supabase-verified access token for a short-lived `HttpOnly`, `SameSite=Lax` cookie (and adds `Secure` in production).
- The session exchange and logout routes require an exact same-origin host including port.
- Protected user routes accept the cookie and re-verify the token with Supabase Auth; tenant membership and permissions remain checked separately.
- The invoice UI signs in through Supabase Auth, exchanges the token for the cookie, and calls only the read-only user invoice endpoint.
- Vite proxies `/api` to the local backend during development.

This is an implementation spike, not production approval. The session cookie currently contains the Supabase access token, with a one-hour cookie lifetime; token refresh, explicit revocation behavior, deployment/proxy configuration, rate limiting, and a full CSRF review for future state-changing financial routes remain open. Production must use HTTPS and same-origin hosting. The invoice screen still requires a tenant UUID; tenant discovery is not implemented. No financial write routes are exposed to this session.

The spike must pass GitHub Actions before further UI expansion. All database tests remain confined to disposable PostgreSQL; no live Finance or ZENOX FRET V2 migration is authorized by this work.
