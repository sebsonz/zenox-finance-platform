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
- New tenant-directory RLS integration tests were added in commit `2cc13ca39e3cca77edd6d8a671fabec89beeff87`; its CI result must be checked before treating these new tests as passed.

### Partially implemented (do not describe as complete)
- Invoice domain: deterministic calculation engine exists, but invoice persistence, numbering, issue/cancel/credit-note lifecycle, document generation, API, and full customer-facing workflows are not yet delivered.
- Customers/currencies: foundational schemas and some repository/service code exist; complete CRUD APIs, pagination/search, tenant security coverage, currency reference population/refresh policy and end-to-end UI are not yet evidenced as complete.
- Taxes: core calculation and immutable snapshot API exist; authoritative jurisdiction-specific rule data requires reviewed sources and competent legal/tax validation. Schema coverage does not mean international tax compliance.
- User authentication: token verification and single-tenant access lookup exist; membership invitation/activation/revocation, secure tenant discovery/listing and full BFF/UI session workflows remain open.
- Frontend: React/Vite/TypeScript shell exists, but complete operational finance workflows are not delivered; no direct browser-to-database access is allowed.

### Not yet implemented or not yet proven in the repository
- Full invoice persistence and lifecycle; invoice sequence concurrency; credit notes and immutable issued documents.
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

1. Confirm CI for commit `2cc13ca39e3cca77edd6d8a671fabec89beeff87`; fix any failure before proceeding.
2. Expand PostgreSQL RLS tests to tenant memberships and customer records; assert the runtime role is non-superuser/non-BYPASSRLS and least-privilege grants are explicit.
3. Establish an auditable test fixture/seed strategy and migration drift check for the dedicated Finance database; do not execute destructive changes on the real Supabase project without a verified inventory and backup.
4. Finish customer and currency APIs/contracts and tenant-isolation tests.
5. Build invoice persistence and lifecycle end-to-end: draft, line items, authoritative totals/tax snapshot, sequence-safe issue, immutability, cancellation/credit note.
6. Build payments and allocations with idempotency, provider adapter boundary, atomic concurrency-safe balance invariants, refunds, and reconciliation.
7. Deliver frontend workflows against a server-side BFF/API boundary; no service secrets in the browser.
8. Add documents, notifications, webhooks/outbox, collections, reporting, customer portal and integrations.
9. Add general ledger and period closing after the invoice/payment source-of-truth is stable.
10. Validate full ZENOX FRET consumer contract, security, backups/restoration, operations and go/no-go before production.

## Hard constraints
- Do not modify the ZENOX FRET V2 database.
- Do not run Finance migrations against FRET.
- Do not reset/drop the whole Supabase schema without inventory, verified backup, reviewed plan and explicit authorization.
- Do not store secrets in source control or expose service credentials to the browser.
- Do not call a feature complete or production-ready without code, passing CI, database-level tests and an accepted end-to-end flow.
- Keep future modules in the target roadmap even when they are scheduled after the MVP.
