# ADR-001 — Secure user-initiated invoice operations

- Status: Proposed for implementation on `feature/invoice-workflow-completion`
- Date: 2026-10-18
- Scope: ZENOX Finance only. No production database changes.

## Context

The existing invoice write services and integration routes use `FinanceRequestContext` with an integration-principal identity and integration scopes. Browser sessions use a separate Supabase-backed user identity, tenant membership, role, and permission model. Passing a user through the integration context would misrepresent the actor and weaken the security boundary. Giving the browser an integration token is prohibited.

## Decision

1. Keep integration routes and integration authentication intact for service-to-service consumers.
2. Build a separate authenticated user BFF under `/api/v1/user/tenants/:tenantId`. Every request must:
   - require `requireUserAuth`;
   - resolve the tenant membership from the verified user ID and issuer;
   - reject missing, inactive, or unauthorized membership;
   - derive tenant scope from the authorized membership, never from client-supplied context alone;
   - validate request bodies with the existing Zod schemas;
   - return bounded, sanitized errors and a correlation ID.
3. Introduce an explicit actor-aware application context for invoice operations. A user actor must preserve the verified identity issuer, subject, membership ID, tenant ID, and correlation ID. It must not be converted into or stored as a `finance_integration_principals` identity.
4. Record user-originated create, update, tax-snapshot, issue, document-access, and credit-note actions as `USER` audit events with a stable user actor reference and safe metadata. Audit writes must be transactionally consistent with the operation where possible; any non-atomic audit path must fail closed for legally significant state transitions.
5. Preserve existing service-to-service integration routes and their existing permission scopes. Avoid broad rewrites of invoice lifecycle logic; factor shared business operations behind a context/actor contract and add regression tests.
6. The frontend calls only the user BFF with the HttpOnly session cookie. It never receives or sends integration credentials.

## Permission mapping

- List/detail and authorized document retrieval: `invoices:read`.
- Draft create/update: `invoices:create`.
- Tax snapshot calculation/attachment: require `invoices:create` and an explicit tax permission appropriate to the operation; the final mapping must align with existing tax ownership semantics and tests.
- Issue: `invoices:issue`.
- Credit note: require a dedicated permission decision before enabling the action. Do not silently equate issue permission with all credit-note permissions.
- Customer lookup: require active tenant membership and a least-privilege customer-read capability; do not expose customers from another tenant.

## Concurrency and idempotency

- Draft updates must retain the existing expected-revision/updated-at precondition and return conflict on stale revisions.
- Issue requests must require an idempotency key, persist the outcome, and return the same result for a safe retry.
- Issued invoice snapshots and artifacts remain immutable.
- Tenant authorization must be rechecked on every detail, artifact, and credit-note request, not only in the list view.

## Migration and test policy

Any schema change needed for user actor attribution must be delivered as a new, forward-only migration and tested only against disposable PostgreSQL in CI. No migration is to be applied to any live database as part of this task. Never access or modify `zenoxfret_v2`.

## Acceptance criteria

- Tests prove unauthenticated, inactive-membership, missing-permission, cross-tenant, invalid-input, stale-write, duplicate-issue, and unauthorized-document requests are rejected.
- Audit records identify the real user actor and never claim the user was an integration principal.
- Existing integration route tests remain green.
- End-to-end disposable-PostgreSQL coverage exercises draft -> update -> tax snapshot -> issue -> artifact retrieval -> credit note.
- Full CI passes on the final commit SHA before the module is reported ready.
