# ZENOX Finance — Invoice Module Completion Checkpoint
Date: 2026-10-18

## Branch
`feature/invoice-workflow-completion`, created from the validated head of PR #7 (`a65515576a069e9998041d12130b8a9b86dce106`). This branch is work-in-progress and has not been merged.

## Confirmed existing CI
- PR #5 head `21e4a59881d62c13b7422dfcb5d03401606683c1`: workflow run 38980590560 succeeded.
- PR #6 head `a34e22d12d94ffbc371a5eab389c9f132d3dfb13`: workflow run 39107207995 succeeded.
- PR #7 head `a65515576a069e9998041d12130b8a9b86dce106`: workflow run 39078364438 succeeded.
These are historical checks for the exact heads listed; any new commits require fresh CI.

## Existing invoice capabilities found
- Multi-line draft create/update, optimistic revision checks and server-side amount calculation.
- Tax snapshot calculation/attachment and tax-evidence checks before issue.
- Idempotent issue request, annual tenant-scoped number allocation, immutable issued invoices/lines.
- Immutable HTML and PDF artifacts with SHA-256 verification.
- Full-reversal credit-note flow with HTML/PDF artifacts.
- User session BFF, active tenant directory, membership authorization, read-only invoice listing.
- Existing unit and disposable-PostgreSQL integration tests.

## Work completed or currently implemented in this continuation
- Added `docs/architecture/ADR-001-secure-user-invoice-operations.md` (commit `e222119d6f699de0970ff78dc69bdc0876f396c9`). It records the separate user-BFF boundary, truthful user actor/audit requirements, permission mapping, idempotency/concurrency requirements, and disposable-PostgreSQL-only migration policy.
- Repository inspection confirmed existing invoice write routes are integration-authenticated, while the browser uses a separate user session and membership permission model. These contexts must not be conflated.\n- Added `backend/src/modules/invoices/types/invoice-operation-context.ts` to model USER and SERVICE actors separately, plus `backend/src/modules/invoices/repositories/invoice-audit.repository.ts` for audit writes inside a caller-owned transaction.\n- Added Finance-only migration `supabase/migrations/20261018000100_invoice_user_actor_attribution.sql` for explicit invoice actor attribution columns. This migration has **not** been executed.\n- Added unit coverage for actor discrimination at `backend/tests/unit/invoice-operation-context.test.ts`; it has **not** been run.\n- Wired actor-aware invoice draft creation/update repositories and services. Draft create/update now write actor attribution and transactionally record audit events.
- Added user BFF endpoints for draft create/update, customer lookup, currency/tax-jurisdiction lookup, tax snapshot attachment, invoice issuance, HTML/PDF invoice retrieval, full-reversal credit-note creation/history and credit-note HTML/PDF retrieval.
- Extended actor attribution through tax snapshots, invoice issuance, invoice document/PDF artifacts, and credit notes. Integration calls retain their real service principal IDs; user actions do not impersonate an integration principal.
- Replaced the read-only invoice workspace with an end-to-end draft/tax/issue/download/credit-note interface, with role-aware action disabling and server-side authorization still authoritative.
- Corrected a malformed actor-attribution migration discovered during review and added migration support for tax snapshots and credit-note/artifact actors. The migration has **not** been executed manually; CI is configured to use disposable PostgreSQL.
- Added/updated unit coverage for explicit tax snapshot actor attribution and user BFF authorization for draft creation, tax snapshot, invoice issue, and credit-note creation. PostgreSQL integration tests verify user-authored draft create/update/audit, user invoice issuance/artifact/audit attribution, and user credit-note/audit attribution. Read-only document endpoint-specific route tests and broader cross-tenant denial scenarios remain a final test-hardening opportunity.
- Draft PR #9: https://github.com/sebsonz/zenox-finance-platform/pull/9 (base `feature/invoice-user-readonly-bff`, head `feature/invoice-workflow-completion`). Open, draft, not merged.
- Latest full CI run `39132913549` passed on commit `bb2d6e760a83570614d8c4a67197495d8cc34f18`: backend typecheck/build, disposable PostgreSQL migrations, runtime-role/fixtures setup, migration drift audit, unit + PostgreSQL integration tests, frontend typecheck and frontend build all succeeded.
- No production database has been touched; `zenoxfret_v2` has not been accessed.

## Required before calling the module complete
1. Complete and verify route-level tests for authentication, tenant membership, each relevant permission, invalid input, cross-tenant denial, stale drafts, duplicate issue/retry, and document/credit-note authorization.
2. Complete PostgreSQL integration/E2E coverage for create -> edit -> tax snapshot -> issue -> retrieve HTML/PDF -> credit note, plus concurrency/immutability checks.
3. Run the full CI successfully on the final branch head, including migrations on disposable PostgreSQL, drift audit, unit/integration tests, frontend typecheck and build.
4. Review PDF pagination/long content and customer/tax display; review jurisdiction-specific compliance separately.
5. Update this checkpoint with the exact successful CI run and verified coverage. Use disposable PostgreSQL only.

## Safety constraints
- Do not merge any PR without explicit user approval.
- Do not apply Finance migrations to a live database during this work.
- Never connect to or modify `zenoxfret_v2`.
- Preserve existing branches and work; no destructive Git operations.
- Do not claim completion or legal compliance until all criteria are verified.
