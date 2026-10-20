# ZENOX Finance — Tenant Registration and Onboarding Specification

- Status: implementation specification; not yet implemented end-to-end
- Scope: ZENOX Finance account signup, email confirmation, organization registration, request tracking, and approval/rejection
- Target branch: `docs/international-mvp-and-requirements`
- Safety: Finance database only. Never run migrations against ZENOX FRET V2. No live database changes are authorized by this document.

## 1. Product intent

ZENOX Finance is an independent international invoicing and finance SaaS. A person must be able to create an individual login, submit an organization for onboarding, track the request, and enter the financial workspace only after the organization is approved and the user's membership is active.

The registration flow must not imply that an organization is legally verified or tax-compliant merely because it has been submitted or approved by the platform.

## 2. Identity and organization are separate

- Supabase Auth is the candidate identity provider already used by the current backend token-verification middleware.
- A valid identity proves who the user is; it does not grant access to an organization.
- Finance tenant membership and role remain authoritative server-side authorization data.
- The browser must never receive a Finance integration token, database credential, Supabase service-role key, or other privileged server secret.
- Do not implement custom password storage.
- Do not trust client-supplied tenant IDs, role codes, organization statuses, approval decisions, or activation timestamps as authorization.

## 3. Registration journey

### Step A — Account signup

Required inputs:
- email address;
- password;
- password confirmation in the UI;
- acceptance of the terms and privacy notice, with a version/timestamp recorded when the platform consent model is implemented.

Name fields may be collected as profile data but must not be used as identity proof.

Requirements:
- Use Supabase Auth signup and its email-confirmation flow.
- Configure allowed redirect URLs in the actual Supabase project; do not guess production URLs.
- Show neutral, non-enumerating messages where account-existence disclosure would expose personal data.
- Never log passwords, access tokens, confirmation tokens, or complete sensitive request bodies.
- Rate-limit signup and resending confirmation messages.
- If email confirmation is required, do not accept an organization submission until the backend verifies that the authenticated identity is confirmed, using authoritative provider data rather than a client claim.

### Step B — Organization submission

Initial required fields:
- legal name;
- establishment country (ISO 3166-1 alpha-2);
- default currency (ISO 4217 and validated against the Finance currency reference).

Optional fields should be added only after product/legal review:
- trading name;
- business registration/tax identifier;
- business address and contact details;
- supporting documents.

The backend must normalize and validate input, reject unknown fields where schemas are strict, and apply length limits. Do not assume every country has the same company-registration identifier or tax-identification format.

### Step C — Atomic submission

The backend must create:
1. a `finance_tenants` row with `status = 'PENDING'`;
2. an `finance_user_tenant_memberships` row for the authenticated identity with `role_code = 'OWNER'` and `status = 'PENDING'`;
3. an audit event recording the submission, actor, request correlation ID, and safe metadata.

These operations must be in one transaction. If any required insert fails, the whole submission must roll back. The server generates the UUID and a unique `tenant_code`; a browser must not choose a privileged tenant identifier or status. A collision must be handled safely and retried only under a bounded strategy.

Do not add a public RLS policy or disable RLS to make this flow work. First review the current FORCE RLS policies, database roles and grants. Implement a narrow server-only registration transaction/function with least privilege, validated input, explicit audit behavior and integration tests. It must not permit arbitrary tenant creation or arbitrary membership/role changes.

### Step D — Request status

A requester must be able to retrieve only their own submission(s), including:
- request/tenant ID;
- legal name and submitted country/currency;
- current status;
- submitted and last-updated timestamps;
- rejection reason if one exists and is safe to disclose;
- next-step guidance.

This read-only request-status endpoint must not require an ACTIVE tenant membership, because the initial membership is PENDING. It must resolve ownership by the verified identity issuer + subject and must not accept the owner identity from the request body.

PENDING requests may not create invoices, issue invoices, record or allocate payments, manage tax rules, or invite other users. A status page is not a financial workspace.

### Step E — Approval or rejection

Approval/rejection must be restricted to an explicit platform-operations authorization boundary. A normal tenant OWNER or ADMIN role is not sufficient to approve their own organization. Do not create a default public admin account or hard-code a platform-admin identity.

Approval should atomically:
- validate the request is currently PENDING;
- set tenant status to ACTIVE;
- set the initial OWNER membership to ACTIVE and set `activated_at`;
- record the approver, timestamp, action, correlation ID and safe audit metadata.

Rejection should atomically:
- validate the request is currently PENDING;
- record a reason and status transition;
- preserve the request for audit and allow a safe user-facing status explanation;
- not activate membership or tenant.

The platform approval identity, permissions, audit table/policy, and operational bootstrap process must be explicitly designed before enabling approval routes. No self-approval and no direct browser writes.

### Step F — Workspace access

A user enters the financial workspace only if all applicable checks pass:
- identity token is valid and not expired;
- email confirmation requirements are satisfied;
- membership is ACTIVE;
- tenant is ACTIVE;
- requested operation is allowed for the user's role;
- the operation remains scoped to the tenant in both application authorization and database/RLS enforcement.

A suspended tenant should retain read-only access to historical data where the user's own membership remains valid, consistent with the cross-product access policy; ordinary writes must be blocked. A personally revoked user must not retain access. Suspension, disablement, deletion and legal/security blocks are distinct states and require explicit policy.

## 4. Suggested API contract

The paths below are proposed contracts, not a claim that these endpoints already exist.

- `POST /api/v1/registration/organizations`
  - Requires verified user authentication and confirmed email where configured.
  - Body: `legalName`, `countryCode`, `defaultCurrency`, plus approved optional fields.
  - Creates PENDING tenant + PENDING OWNER membership + audit event atomically.
  - Returns `202 Accepted` with a safe request summary.
  - Does not accept tenant status, owner identity, role, or approval fields from the client.

- `GET /api/v1/registration/organizations`
  - Requires verified user authentication.
  - Returns only requests linked to the authenticated issuer + subject.
  - Does not return another person's or another tenant's registration data.

- `GET /api/v1/registration/organizations/:requestId`
  - Requires verified user authentication.
  - Returns only a request owned by the authenticated identity; return a consistent not-found/denied response that avoids enumeration.

- Platform approval/rejection endpoints:
  - Do not expose until platform-operations authentication/authorization, audit, and least-privilege DB grants are reviewed.
  - Use optimistic status transitions so two concurrent decisions cannot both succeed.
  - Approval/rejection must be idempotent or return a documented conflict for an already-decided request.

Error responses must be safe, structured and free of SQL details, secrets or internal stack traces. All routes need request correlation IDs and rate limits appropriate to signup/status operations.

## 5. Data model decisions to resolve before migration

Existing schema foundations include tenant status values `PENDING`, `ACTIVE`, `SUSPENDED`, `DISABLED`, and membership status values `PENDING`, `ACTIVE`, `SUSPENDED`, `REVOKED`. Do not duplicate these state concepts in an unrelated status field without a reviewed reason.

Before implementing approval/rejection, decide whether to add:
- a dedicated registration-request table (recommended if rejection reason, reviewer, submission snapshot, decision timestamp and resubmission history are required);
- tenant profile/contact fields beyond the existing legal name, country and default currency;
- a formal platform-operations principal/role model;
- an append-only audit event contract for platform-level actions not yet associated with an ACTIVE tenant.

Prefer retaining the registration request and its decision history over deleting rejected requests. Do not store identity-provider passwords or confirmation tokens in Finance tables. Any business documents require private storage, narrow access, malware/content validation and retention policy; never store them as public URLs.

## 6. RLS and database safety requirements

- Keep RLS enabled and forced on tenant-scoped tables.
- No broad permissive policy for anonymous/browser roles.
- No database service credentials or privileged keys in Vite `VITE_*` variables or browser bundles.
- Registration must use a reviewed server-only database privilege path; it must not use a fabricated tenant context to bypass authorization.
- Validate issuer and subject from the verified token; do not trust them from the request body.
- Keep all queries parameterized and tenant/identity-scoped.
- Test missing tenant context, cross-tenant reads, wrong identity, duplicate submission, concurrent approval, transaction rollback, and least-privilege grants.
- Migrations, if needed, must be tested only against disposable PostgreSQL/CI first. No live Finance migration without explicit authorization. Never access or modify `zenoxfret_v2`.

## 7. Minimum acceptance criteria

1. A new user can sign up through Supabase Auth and receives the configured confirmation email.
2. An unconfirmed user cannot submit an organization if confirmation is required.
3. A confirmed user can submit a valid organization; tenant and OWNER membership are both PENDING.
4. Tenant and membership are created atomically; forced failures leave neither partial row.
5. Duplicate or repeated submission is handled by a documented idempotency/duplicate policy.
6. A user can see only their own request status, including while PENDING or REJECTED.
7. A PENDING tenant cannot create or issue invoices, record payments, manage tax rules, or invite members.
8. A tenant OWNER cannot approve their own organization.
9. Only an authorized platform operator can approve/reject; every decision is audited.
10. Approval activates tenant and OWNER membership atomically; rejected requests never gain financial access.
11. A revoked membership and a different tenant's ID cannot be used to retrieve the request.
12. Cross-tenant RLS and API isolation tests pass on disposable PostgreSQL.
13. Frontend typecheck/build and backend typecheck/build/unit tests pass.
14. CI validates the exact final commit SHA; no claim of completion is made from a draft UI or design document alone.

## 8. Implementation order

1. Inspect the current migration/RLS/grant state, audit-event schema and exact database role used by the backend.
2. Finalize registration-request persistence and platform-operations authorization design.
3. Implement server-side atomic submission and owner-specific status reads.
4. Implement protected approval/rejection and audit events.
5. Add unit tests and disposable-PostgreSQL integration/security tests.
6. Build signup, email-confirmation return, organization form, pending/rejected states and login UI.
7. Configure real Supabase Auth redirect URLs in the project settings and test the email journey.
8. Run backend/frontend checks, migration drift checks and exact-head CI.
9. Keep the PR in draft until the acceptance criteria are met and reviewed.

## 9. Explicitly out of scope for the first registration slice

- Automatic company approval.
- Automatic import of company status from ZENOX FRET.
- Country-specific legal validation that has not been researched and reviewed.
- Payments, invoice operations, or tax operations for PENDING tenants.
- Destructive deletion of rejected or suspended organizations.
- Live database migration or production deployment.

## 10. Current repository gap

The repository already has Supabase access-token verification, tenant-membership role definitions, a tenant-access endpoint, and the tenant/membership schema foundation. The frontend remains a demonstration shell. A complete signup, organization submission, owner-specific pending-request status, and platform approval/rejection workflow are not yet evidenced as implemented end-to-end.
