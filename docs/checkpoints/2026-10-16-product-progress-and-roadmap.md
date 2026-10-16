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
- Invoice domain: draft persistence and tenant-scoped create/list/detail API now exist with stored lines, server-calculated draft totals, a customer snapshot and currency precision snapshot. Keyset pagination uses the `(created_at, id)` tuple matching the descending sort. Conditional draft editing is now implemented: `PUT /api/v1/invoices/drafts/:invoiceId` requires `expectedUpdatedAt`, updates only a tenant-owned `DRAFT` whose version matches, recalculates totals server-side, and replaces lines in the same transaction. Stale/non-editable versions return `409 DRAFT_NOT_FOUND_OR_CHANGED`. PR #4 merged at `d01afcc306e92746e4c7e7c18ebfd807e13c61be`; full CI is green: https://github.com/sebsonz/zenox-finance-platform/actions/runs/38969717194. Still incomplete: authoritative jurisdiction-based tax rule application and immutable tax snapshot binding during draft/issue, sequence-safe numbering, issue/cancel/credit-note lifecycle, immutable issued documents, document generation/PDF and full customer-facing workflows. The draft tax-rate input is provisional and is not a claim of tax compliance.
- Customers/currencies: the first authenticated API vertical slice is implemented and CI-validated. `POST /api/v1/customers`, `GET /api/v1/customers` (search/status/keyset cursor pagination with `hasMore`/`nextCursor`), `GET /api/v1/customers/:customerId`, and `GET /api/v1/currencies` for active reference data are mounted. Customer operations use the authenticated service principal's tenant context and existing transaction-local RLS boundary. Unit + disposable-PostgreSQL tests cover contracts, scopes, foreign-tenant access, cursor order, and read-only currency grants. Still incomplete: customer update/archive, currency reference population/refresh operations, OpenAPI consumer contracts, end-to-end UI/workflows.
- Taxes: core calculation and immutable snapshot API exist; authoritative jurisdiction-specific rule data requires reviewed sources and competent legal/tax validation. Schema coverage does not mean international tax compliance.
- User authentication: token verification and single-tenant access lookup exist; membership invitation/activation/revocation, secure tenant discovery/listing and full BFF/UI session workflows remain open.
- Frontend: React/Vite/TypeScript shell exists, but complete operational finance workflows are not delivered; no direct browser-to-database access is allowed.

### Not yet implemented or not yet proven in the repository
- Authoritative tax calculation/snapshot binding to the invoice lifecycle; sequence-safe issue; credit notes, cancellation policy and immutable issued documents.
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
3. **COMPLETED (2026-10-16, repository + CI evidence):** Added and mounted authenticated customer create/list/detail endpoints and active currency reference endpoint. Customer listing supports strict bounded search/status filters and ascending UUID keyset pagination (`limit + 1` read, `hasMore`, `nextCursor`). Added API contract documentation, route/schema unit tests, disposable-PostgreSQL customer tenant isolation/cursor checks, and read-only currency privilege tests. PR #3 merged as main commit `2ec0231b9c711cbb0ef6368dd8a62b9945b3bf8d`; final PR CI green: https://github.com/sebsonz/zenox-finance-platform/actions/runs/38968714706. Post-merge `main` CI is triggered and must be checked before treating the merge itself as fully green.
4. **COMPLETED (2026-10-16, repository + CI evidence):** Implemented optimistic-concurrency draft editing through `PUT /api/v1/invoices/drafts/:invoiceId`, protected by `invoice:draft:write`; validates `expectedUpdatedAt`, recalculates totals server-side, updates only a tenant-scoped `DRAFT` at the expected version and replaces lines inside the same transaction. Added unit route coverage and disposable-PostgreSQL checks for correct version, stale retry and rejection after issue. PR #4 merged as main commit `d01afcc306e92746e4c7e7c18ebfd807e13c61be`; full PR CI green: https://github.com/sebsonz/zenox-finance-platform/actions/runs/38969717194. **NEXT EXECUTION ITEM:** Implement the authoritative tax-rule → immutable tax-snapshot binding for invoice drafts, preserving the current warning that a client-supplied draft tax rate is provisional. Inspect existing tax engine, jurisdiction/rule repositories and snapshot repository first; do not treat current draft amounts as official tax results. Add transactional integration tests proving snapshot contents match the invoice version and cannot be mutated. Continue on disposable PostgreSQL/CI only; do not modify live Supabase or ZENOX FRET.
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

The latest code commit merged on `main` is `d01afcc306e92746e4c7e7c18ebfd807e13c61be` (invoice draft editing with optimistic concurrency); PR CI passed: https://github.com/sebsonz/zenox-finance-platform/actions/runs/38969717194. The next session should start with authoritative tax-rule → immutable tax-snapshot binding for invoice drafts, then sequence-safe issuance and immutable issued documents; read current main files rather than asking for previously available files. All work used disposable PostgreSQL/CI only. The post-merge `main` workflow for `d01afcc` has been triggered and must be checked to completion. No live Finance Supabase connection or migration was performed, and ZENOX FRET V2 was not touched.


## Continuation update — 2026-10-16 (tax binding + issuance)

The Finance-only invoice tax binding and sequence-safe issuance work is now implemented on branch `feat/invoice-tax-snapshot-binding`, PR #5 remains open as a draft:
https://github.com/sebsonz/zenox-finance-platform/pull/5

Latest validated code head at this checkpoint: `e02808d3e551b0c49e44ad142571f47582eb0c4f`. Exact-head CI passed: https://github.com/sebsonz/zenox-finance-platform/actions/runs/38978118027. The passing workflow includes backend typecheck/build, disposable PostgreSQL migration application, least-privilege runtime-role setup, migration checksum audit, unit + PostgreSQL integration tests, and frontend typecheck/build.

### Newly implemented and CI-validated
- Migration `20261016001100_invoice_tax_snapshot_binding.sql`: invoice revisions, snapshot link/version, tax status and amount due after withholding; constraints and tenant/document/revision linkage guards.
- Per-line effective tax calculation from active jurisdiction/date/category rules; immutable tax input/rule/result snapshot; atomic invoice-line and invoice-total update; draft edit invalidates old snapshot link and increments document revision.
- Migration `20261016001200_invoice_issuance_lifecycle.sql`: tenant/year sequence allocation through a tenant-context-checked database function; unique invoice code; issued-at/issuer metadata; database guard requiring a tax snapshot before issuance; immutable invoice and line triggers.
- Protected `POST /api/v1/invoices/:invoiceId/issue` requiring `invoice:issue` and the exact `expectedUpdatedAt` concurrency token.
- Number allocation, invoice status change and issue metadata are in one transaction. PostgreSQL integration tests exercise concurrent issuance with unique invoice codes, linked tax evidence, and rejection of issued-document and line mutation. The direct-database issuance bypass is also tested.
- Existing draft integration fixture was updated to issue only with a linked snapshot and issuer identity.
- Sequence table is not directly granted to the runtime role; allocation uses the tenant-context-checked function. CI migration application and checksum audit passed.
- PR remains a draft and `main` remains unchanged. No live Finance Supabase migration was run; ZENOX FRET V2 was not touched.

### Honest remaining invoice-module scope — do not start Payments yet
1. Immutable issued-document artifact/rendering and PDF generation with a private-storage boundary, content hash, version and retrieval authorization.
2. Credit-note/correction and cancellation-event workflow that never edits the issued source invoice.
3. Issuance idempotency/retry semantics, complete legal-field/numbering policy configuration, and jurisdictional review (no claim of tax/legal compliance yet).
4. Complete customer-facing invoice UI/workflows and end-to-end acceptance covering draft → tax snapshot → issue → immutable artifact → correction/credit note.
5. Final security/concurrency review and exact-head green CI before merging PR #5.

After these invoice lifecycle items are complete and validated, proceed to Payments/allocations. Keep all validation on disposable PostgreSQL until explicitly approved otherwise. Never apply Finance migrations to the ZENOX FRET V2 database.


## Continuation update — 2026-10-16 (immutable issued-document artifact)

After the issuance lifecycle passed CI, added immutable server-rendered HTML document artifacts in the same transaction as invoice issuance. Current implementation is on the same draft PR #5:
https://github.com/sebsonz/zenox-finance-platform/pull/5

Validated head for this slice: `55c58664a0675469487003995ff36663c35517f2`. Exact-head CI is green: https://github.com/sebsonz/zenox-finance-platform/actions/runs/38978492883.

### Implemented and CI-validated
- Migration `20261016001300_invoice_document_artifacts.sql`: tenant-scoped artifact table with invoice revision, invoice code, HTML content, SHA-256, issuer principal and creation timestamp; RLS is enabled and forced; artifact rows cannot be updated or deleted.
- Database insert guard permits an artifact only for the matching issued invoice revision with calculated tax evidence.
- Issuance now generates and stores the HTML artifact inside the same transaction. If rendering or artifact insertion fails, issuance rolls back.
- New authenticated `GET /api/v1/invoices/:invoiceId/document` endpoint requires `invoice:read`, returns the stored HTML with an ETag/content hash, private no-store caching, and tenant scope.
- Retrieval verifies the SHA-256 digest before returning content. Unit and PostgreSQL integration tests cover concurrent numbering, artifact creation/content/hash, and immutability.
- CI passed backend typecheck/build, disposable PostgreSQL migrations, least-privilege setup, migration drift audit, unit/PostgreSQL integration tests, frontend typecheck/build. No live Finance Supabase was changed; no ZENOX FRET V2 DB was touched.

### Remaining before the invoice module is complete
1. PDF generation and a private object-storage adapter/retention policy; current artifact is immutable printable HTML, not PDF.
2. Credit-note/correction workflow and cancellation events, preserving the original issued invoice and its artifact.
3. Idempotent issuance/retry behavior and jurisdiction-configurable numbering/legal fields; competent legal/tax review remains mandatory.
4. Complete frontend/customer workflows and end-to-end acceptance from draft → tax snapshot → issue → immutable document → credit note/correction.
5. Security/concurrency review and green CI on the final invoice-module head before merging PR #5.

Do not start Payments until these invoice lifecycle items are completed and validated. Keep PR #5 a draft while work remains. All DB tests use disposable PostgreSQL only.


## Continuation update — 2026-10-17 (multi-line PDF + full-reversal credit notes)

Additional code is now on PR #5 / branch `feat/invoice-tax-snapshot-binding`. This is implemented but must not be marked validated until CI passes on the final head.

### Added
- Multi-line invoice contract explicitly supports 1–500 lines. Repository persists every line, and HTML/PDF renderers iterate over every line in order.
- Added renderer unit tests with multiple lines, discount/tax examples and HTML-escaping protection; invoice-draft schema tests now explicitly cover a multi-line request.
- Added a built-in PDF 1.4 renderer and immutable PDF artifact table/migration `20261016001400_invoice_pdf_artifacts.sql`. PDF is created atomically with HTML during issuance, stores SHA-256, is tenant-scoped, immutable and hash-verified on retrieval.
- Added authenticated `GET /api/v1/invoices/:invoiceId/document.pdf` with private/no-store caching and an ETag hash.
- Added full-reversal credit-note migration `20261016001500_invoice_credit_notes.sql`, service, routes and tests. Only an issued source invoice with its linked tax snapshot can be reversed. The source invoice remains unchanged; a unique `CN-YYYY-NNNNNN` credit note stores original line/customer/tax evidence and immutable HTML/PDF renditions. Only one full reversal per source invoice is allowed.
- Credit-note retrieval endpoints are tenant-scoped, require `invoice:read`, and verify content hashes. Creation requires `invoice:credit`.

### Explicit limitations
- Credit notes currently support full reversal only, not partial credit, debit notes, replacement invoices, or approval workflows.
- Credit-note tax treatment and required legal fields must be validated per jurisdiction; the source snapshot is preserved as evidence, not a universal claim of credit-note tax compliance.
- PDF output is a technical printable artifact using a built-in Helvetica PDF 1.4 writer; it normalizes non-ASCII characters and still needs visual/legal review, page-layout QA and archival-policy validation.
- Frontend invoice workflows are still not connected to authenticated backend CRUD; the current frontend marks the invoice page as not connected. This must be completed before declaring the whole module done.
- Issuance retry idempotency and final end-to-end UI acceptance remain open.
- Keep PR #5 in draft. Do not merge until the latest exact head passes all CI checks and remaining frontend/idempotency/legal-scope criteria are handled. No live Finance migration and no ZENOX FRET V2 database access.


### Idempotency continuation — 2026-10-17
- Added migration `20261016001600_invoice_issuance_idempotency.sql` and tenant-scoped idempotency records for invoice issuance.
- `POST /api/v1/invoices/:invoiceId/issue` now requires an `Idempotency-Key` header (8–128 chars). Repeating the same key for the same invoice/revision returns the same issued invoice; key reuse against a different invoice/revision returns conflict. The idempotency reservation, issue transition, and artifact creation share one transaction, so failures roll back cleanly.
- Unit tests and PostgreSQL integration tests now pass idempotency keys; the integration suite checks a retry returns the same invoice code without duplicate artifact creation.
- Exact CI passed for the code head before idempotency was added: `58ed01005836f2ba45a496ecf329830ecb913544`, run https://github.com/sebsonz/zenox-finance-platform/actions/runs/38980172883.
- Current idempotency-inclusive head still requires a fresh exact-head CI pass. Do not merge before that pass.
