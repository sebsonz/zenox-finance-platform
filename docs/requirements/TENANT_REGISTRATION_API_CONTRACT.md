# ZENOX Finance — Registration API Contract

- Status: implementation contract, pending code implementation and automated validation.
- Related specification: [Tenant Registration and Onboarding](./TENANT_REGISTRATION_AND_ONBOARDING.md).
- Target documentation branch: `docs/international-mvp-and-requirements`.
- Safety: do not run migrations against ZENOX FRET V2. Do not change a persistent database without explicit approval.

## 1. Contract principles

1. Supabase Auth authenticates a person; Finance database records authorize access to an organization.
2. The browser never receives database credentials, the Finance integration token, or a Supabase service-role key.
3. The backend derives the identity subject and issuer from the verified session. It must ignore client-supplied identity IDs.
4. Tenant creation, owner membership creation, and the corresponding audit event must be atomic.
5. A new tenant is not usable for financial operations while it is `PENDING`.
6. Approval/rejection routes require a separately established platform-operations authorization mechanism. A tenant OWNER/ADMIN role is not platform authority.
7. No RLS policy may be weakened or disabled to make registration work.

## 2. Public identity flow

### Sign up

The frontend calls Supabase Auth sign-up with email, password, and an explicitly configured confirmation redirect. The redirect must be included in the Supabase project's allowed redirect URLs. The frontend must handle both a returned session and a confirmation-required response where the session is absent.

The UI must:
- validate required fields and password confirmation before submitting;
- avoid logging passwords, tokens, or confirmation links;
- show a neutral response that does not unnecessarily disclose whether an email is registered;
- explain that email confirmation may be required before organization submission;
- provide a recoverable error state for network/provider failures.

### Sign in / sign out

Use the existing backend user-session boundary where available. Never treat a client-supplied tenant ID as proof of membership. On sign out, clear the HttpOnly session cookie and clear client-side auth state. Session handling must be reviewed for CSRF and cookie-path compatibility before production.

## 3. Proposed API endpoints

All paths are relative to `/api/v1`. These are the target contract; they are not a claim that the routes currently exist.

### `POST /registration/organizations`

Authentication: verified user session required. Email confirmation must be checked according to the configured identity-provider policy.

Request:

```json
{
  "legalName": "Example Logistics Ltd",
  "countryCode": "BJ",
  "defaultCurrency": "XOF",
  "tenantCode": "EXAMPLE-LOGISTICS",
  "contact": {
    "fullName": "Example User",
    "phone": "+229..."
  },
  "acceptedTermsVersion": "2026-10"
}
```

Rules:
- Normalize and validate all fields on the server.
- Accept only ISO-style uppercase two-letter country codes and uppercase three-letter currency codes; verify supported currency and country against authoritative Finance reference data.
- Do not trust a requested tenant code; validate availability and apply the documented canonicalization rules.
- Do not accept `identity_subject`, `identity_issuer`, `role_code`, `status`, or approval fields from the client.
- Create tenant with `PENDING` status, create a `PENDING` OWNER membership using the verified issuer/subject, and write a safe audit event in one transaction.
- Enforce one applicable pending/active owner request per identity/tenant according to the eventual uniqueness policy. Concurrent duplicate submissions must return a stable conflict response, not partial rows.
- Return no secrets and no privileged internal fields.

Success: `202 Accepted`

```json
{
  "request": {
    "id": "uuid",
    "tenantId": "uuid",
    "status": "PENDING",
    "submittedAt": "ISO-8601 timestamp"
  }
}
```

### `GET /registration/organizations`

Authentication: verified user session required.

Returns only organization requests/tenants associated with the current verified identity. Never accept an identity subject or issuer filter from the caller. Include a minimal list with request ID, organization name, status, submission time, and last status change.

### `GET /registration/organizations/:requestId`

Authentication: verified user session required.

Return a request only if the current identity has an authorized relationship to it. Use the same non-disclosing not-found response for nonexistent and unauthorized request IDs where appropriate. Do not expose internal moderation notes or another user's personal data.

### Platform moderation endpoints

Proposed paths:
- `POST /platform/registration/organizations/:requestId/approve`
- `POST /platform/registration/organizations/:requestId/reject`

These endpoints must not be implemented until the platform-operations role, bootstrap process, and authorization source are explicitly defined. They must:
- require authenticated platform staff with a dedicated permission, not a tenant role;
- prohibit self-approval and record the actor;
- require a reason for rejection and validate safe length/content;
- apply a conditional state transition from `PENDING` only;
- update tenant and owner membership consistently in a transaction;
- write an immutable audit event;
- be idempotent or return a deterministic conflict on repeated/conflicting actions;
- avoid allowing the requester to change the result by supplying status fields.

## 4. Status model

Request lifecycle:
- `PENDING`: submitted and awaiting moderation;
- `APPROVED`: moderation decision recorded; tenant and owner membership are activated only after the atomic activation succeeds;
- `REJECTED`: decision recorded, with a safe user-facing reason where policy allows;
- `CANCELLED`: optional future state, only if a user cancellation policy is approved.

The tenant table's status vocabulary remains `PENDING`, `ACTIVE`, `SUSPENDED`, `DISABLED`. The membership vocabulary remains `PENDING`, `ACTIVE`, `SUSPENDED`, `REVOKED`. Do not force request lifecycle labels into tenant or membership status columns if the current schema does not support them; use a dedicated request entity or a reviewed, explicit mapping. Schema alignment is a prerequisite to migrations.

## 5. Error envelope

Use a stable envelope:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request contains invalid fields.",
    "requestId": "correlation-id",
    "details": []
  }
}
```

Expected classes include:
- `UNAUTHENTICATED` — missing/invalid session;
- `EMAIL_CONFIRMATION_REQUIRED` — identity provider requires confirmation;
- `VALIDATION_ERROR` — invalid request fields;
- `REGISTRATION_CONFLICT` — duplicate or incompatible request;
- `REGISTRATION_NOT_FOUND` — absent or inaccessible request;
- `PLATFORM_AUTHORIZATION_REQUIRED` — caller lacks platform moderation authority;
- `USER_AUTH_NOT_CONFIGURED` / `AUTH_PROVIDER_UNAVAILABLE` — safe service failure;
- `INTERNAL_ERROR` — generic unexpected failure without SQL, stack, token, or secret leakage.

Use appropriate HTTP status codes (400/401/403/404/409/422/429/500/503) consistently. Apply rate limits to signup, organization submission, and moderation endpoints.

## 6. Audit and privacy requirements

Record actor type/reference, action, tenant/request reference, correlation ID, timestamp, and minimal safe metadata. Never store passwords, raw access/refresh tokens, confirmation URLs, service credentials, or full identity-provider payloads in audit metadata. Limit personal information in logs and define retention before production.

## 7. Required implementation tests (not yet run)

### Unit/service
- request validation and normalization;
- identity issuer/subject always derived from verified auth;
- unsupported currency/country and malformed tenant code rejected;
- duplicate request and concurrent submission behavior;
- tenant, membership, and audit transaction rolls back together on failure;
- status transitions reject non-PENDING moderation;
- platform moderation rejects tenant OWNER/ADMIN without platform permission;
- self-approval is rejected;
- responses never expose credentials or private moderation data.

### API/integration
- unauthenticated submit/list/detail returns 401;
- user A cannot list or read user B's request;
- valid submission creates one PENDING tenant and one PENDING OWNER membership;
- database failure leaves no partial registration;
- unconfirmed-email behavior matches configured Supabase policy;
- approval activates tenant and owner membership atomically;
- rejection preserves a safe reason and audit trail;
- rate limiting and generic error responses work.

### Environment and safety
- run schema/migration checks only on disposable Finance PostgreSQL/CI;
- verify the exact branch and commit SHA before reporting test results;
- do not run any Finance migration against `zenoxfret_v2`;
- do not claim acceptance until the relevant automated tests have actually run.

## 8. Implementation order

1. Confirm the dedicated feature branch exists.
2. Reconcile current tenant/membership schema and migration order.
3. Implement validation schemas, transaction repository/service, and registration routes.
4. Define secure platform-operations authorization before implementing moderation routes.
5. Implement frontend signup, confirmation, sign-in, organization submission, and request-status pages.
6. Add unit/API/DB tests and run them against disposable Finance PostgreSQL.
7. Perform a final diff/security review; do not merge without explicit approval.
