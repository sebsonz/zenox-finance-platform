# ZENOX Finance — product progress and roadmap checkpoint

Date: 2026-10-16
Branch: `main`
Repository: https://github.com/sebsonz/zenox-finance-platform
Dedicated Supabase project reference: `qsmairsmgfnlmiltvgvn`

## How to read the architecture checklist

The supplied `ZENOX_Finance_Checklist_Architecture.xlsx` contains 173 checklist entries across 12 decision/implementation categories plus the read-me and dashboard sheets. The six foundational decisions are approved, and the reviewed checklist entries are marked `VALIDÉ`. These statuses mean the scope/design decision is approved; they do **not** prove that the corresponding feature has been implemented, tested against the live Finance database, or released.

Preserve the approved target: independent, extensible finance platform; modular monolith/API-first; dedicated PostgreSQL/Supabase; future general ledger; payment registry and provider adapters (not a payment institution by default); ZENOX FRET V2 as the first API consumer only after a separate integration contract. Never merge Finance and FRET databases or let FRET access Finance SQL directly.

## Verified repository state

### Implemented in code (repository/CI evidence)
- Node.js 22+, TypeScript, Express 5, versioned API composition and health/readiness routes.
- Strict modular architecture rules and CI for backend and frontend typecheck/build plus tests and disposable PostgreSQL migrations.
- Exact decimal money primitives and invoice calculation engine with unit tests.
- Tenant and integration-principal foundations; service-to-tenant grants normalized relationally; service authentication with client ID, bearer secret digest, scope, and tenant grant checks.
- PostgreSQL migrations for tenant foundation, idempotency/audit foundations, customers/currencies, tax jurisdictions/rules, immutable tax calculation snapshots, user-to-tenant memberships and tenant self-row RLS.
- Customer schema/service/repository foundations and currency repository.
- Tax calculation engine, versioned rule/snapshot services, protected `POST /api/v1/tax/calculate`, immutable snapshots and unit/PostgreSQL security test suite.
- Supabase access-token verification through the Auth user endpoint, server-side user-auth middleware, tenant membership role permissions, and a protected tenant-access endpoint.
- Recent successful CI runs at time of writing:
  - Tenant access route tests: https://github.com/sebsonz/zenox-finance-platform/actions/runs/38960597914
  - Tenant repository transaction/RLS change: https://github.com/sebsonz/zenox-finance-platform/actions/runs/38960942030
  - Tenant self-row RLS migration: https://github.com/sebsonz/zenox-finance-platform/actions/runs/38960961866
- Tenant-directory RLS integration tests initially exposed a policy issue; forward-only migration `20261016000900_reassert_tenant_directory_rls.sql` was added and CI passed: https://github.com/sebsonz/zenox-finance-platform/actions/runs/38964772486.
- Invoice draft persistence, tenant-scoped routes, validation tests and PostgreSQL RLS isolation tests have been added. Invoice/line tenant isolation passed in CI: https://github.com/sebsonz/zenox-finance-platform/actions/runs/38965751253. The keyset pagination fix aligning the `(created_at, id)` cursor with descending sort passed CI: https://github.com/sebsonz/zenox-finance-platform/actions/runs/38966455543. Expanded customer RLS coverage also passed CI: https://github.com/sebsonz/zenox-finance-platform/actions/runs/38966522663. The checkpoint update itself passed CI: https://github.com/sebsonz/zenox-finance-platform/actions/runs/38966551445.

### Partially implemented (do not describe as complete)
- Invoice domain: draft persistence and tenant-scoped create/list/detail API now exist with stored lines, server-calculated draft totals, a customer snapshot and currency precision snapshot. Keyset pagination now compares the `(created_at, id)` tuple matching the descending sort; CI passed. Still incomplete: draft editing, authoritative jurisdiction-based tax rule application and tax snapshot binding at issue time, sequence-safe numbering, issue/cancel/credit-note lifecycle, immutable issued documents, document generation/PDF and full customer-facing workflows. The draft tax-rate input is provisional and is not a claim of tax compliance.
- Customers/currencies: foundational schemas and some repository/service code exist; complete CRUD APIs, pagination/search, tenant security coverage, currency reference population/refresh policy and end-to-end UI are not yet evidenced as complete.
- Taxes: core calculation and immutable snapshot API exist; authoritative jurisdiction-specific rule data requires reviewed sources and competent legal/tax validation. Schema coverage does not mean international tax compliance.
- User authentication: token verification and single-tenant access lookup exist; membership invitation/activation/revocation, secure tenant discovery/listing and full BFF/UI session workflows remain open.
- Frontend: React/Vite/TypeScript shell exists, but complete operational finance workflows are not delivered; no direct browser-to-database access is allowed.

### Not yet implemented or not yet proven in the repository
- Invoice draft editing; authoritative tax calculation/snapshot binding to invoice lifecycle; sequence-safe issue; credit notes, cancellation policy and immutable issued documents.
- Payments, payment attempts/provider adapters, confirmation, refunds, disputes, allocations and anti-overallocation/concurrency guarantees.
- Accounts receivable, reminders/collections, supplier bills/expenses, bank transactions, reconciliation and bank import adapters.
- General ledger: chart of accounts, accounting periods, balanced journal entries, posting rules and period close.
- Quote/order workflows; recurring billing and automation; document template/PDF and private object storage; customer portal; notifications.
- Webhook subscription/delivery/outbox/retry workflows; integrations administration, key rotation and credential lifecycle.
- Reporting/exports, forecasting/budgets, platform plans/subscriptions/usage metering and platform administration.
- Complete OpenAPI contract and consumer contract tests; end-to-end business journeys; load/concurrency tests beyond existing targeted cases; accessibility/i18n/polished responsive UI.
- Live Supabase inventory, role grants and migration execution, secret-manager configuration, backup/restore rehearsal, production deployment/monitoring and independent financial acceptance.

## Progress assessment (honest, scope-based)

Do not derive product completion percentage from the checklist's `VALIDÉ` count. The checklist records design decisions, not implementation completion. The repository is in the **foundation and security hardening phase**, with a working tax vertical slice and partial customer/currency/auth foundations. The main invoice/payment workflows and most of the broad target platform remain unbuilt.

A precise percentage is not asserted because there is no implemented-feature inventory with agreed weights and no live end-to-end acceptance run. For planning purposes only, the product is early-stage: architectural decisions are broadly approved, but production readiness and full product completeness are not close to being demonstrated yet.

## Next execution order

1. **COMPLETED (2026-10-16, repository + CI evidence):** Extended PostgreSQL RLS coverage to tenant memberships; verifies runtime role is non-superuser/non-BYPASSRLS, lacks database/role creation, tests tenant-context isolation/fail-closed behavior, and checks effective least-privilege table/schema grants. Main commit `52d94df4e107127be7403ed2b00327c9b36b968e`; CI green: https://github.com/sebsonz/zenox-finance-platform/actions/runs/38967439437 and main post-merge run https://github.com/sebsonz/zenox-finance-platform/actions/runs/38967596455.
2. **COMPLETED (2026-10-16, repository + CI evidence):** Added reviewed synthetic fixture manifest `tests/fixtures/integration-seed-manifest.json`, loopback-only `finance_test` guard for fixture prep, read-only migration checksum audit, and unit coverage for drift edge cases. Main commit `d536ed5e088102b48f03fa942e557851098a275b`; PR CI green: https://github.com/sebsonz/zenox-finance-platform/actions/runs/38967886273. CI runs drift audit after migrations against disposable PostgreSQL; it never applies SQL itself.
3. **NEXT EXECUTION ITEM:** Finish customer and currency APIs/contracts, pagination/search, and tenant-isolation tests. Inspect current customer/currency routes, services, repositories and response schemas before implementing only missing pieces. Continue using disposable PostgreSQL and CI. Do not connect to or modify live Supabase until a separate verified inventory, backup and explicit migration authorization.
4. Continue invoice lifecycle in safe order: draft editing; authoritative jurisdiction-based tax rules and immutable tax snapshots; sequence-safe issue; immutable issued documents; cancellation/credit notes; then end-to-end acceptance. The current draft tax rate remains provisional and must not be represented as official tax calculation.
5. Build payments and allocations with idempotency, provider adapter boundary, atomic concurrency-safe balance invariants, refunds, and reconciliation.
6. Deliver frontend workflows against a server-side BFF/API boundary; no service secrets in the browser.
7. Add documents, notifications, webhooks/outbox, collections, reporting, customer portal and integrations.
8. Add general ledger and period closing after the invoice/payment source-of-truth is stable.
9. Validate full ZENOX FRET consumer contract, security, backups/restoration, operations and go/no-go before production.

## Hard constraints
- Do not modify the ZENOX FRET V2 database.
- Do not run Finance migrations against FRET.
- Do not reset/drop the whole Supabase schema without inventory, verified backup, reviewed plan and explicit authorization.
- Do not store secrets in source control or expose service credentials to the browser.
- Do not call a feature complete or production-ready without code, passing CI, database-level tests and an accepted end-to-end flow.
- Keep future modules in the target roadmap even when they are scheduled after the MVP.


## New-chat continuation note (2026-10-16)

The latest verified main commit is `d536ed5e088102b48f03fa942e557851098a275b`; its PR CI passed: https://github.com/sebsonz/zenox-finance-platform/actions/runs/38967886273. Membership RLS/privilege coverage was merged in `52d94df4e107127be7403ed2b00327c9b36b968e` and main CI passed: https://github.com/sebsonz/zenox-finance-platform/actions/runs/38967596455. The next chat/session should start with customer/currency API contracts, pagination/search and tenant-isolation tests; read the current main tree rather than asking for previously available files. Both completed security/test-foundation blocks used disposable PostgreSQL only. No live Finance Supabase connection or migration was performed, and ZENOX FRET V2 was not touched.
