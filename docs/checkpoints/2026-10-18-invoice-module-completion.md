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

## Required before calling the module complete
1. Implement user-facing BFF write flows for draft create/update, tax snapshot calculation, invoice issue, and authorized document downloads; add customer lookup/list needed by the invoice form.
2. Define a first-class, truthful audit actor model for user-initiated writes. Do not impersonate an integration principal or expose integration credentials to the browser.
3. Complete frontend workflow: create/edit draft with multiple lines, tax review, issue confirmation/idempotency, list/detail, HTML/PDF download, and credit-note history/action where authorized.
4. Add route tests for authentication, tenant membership, each relevant permission, invalid input, cross-tenant denial, stale draft, duplicate issue/retry, and document authorization.
5. Add PostgreSQL integration/E2E coverage for create -> edit -> tax snapshot -> issue -> retrieve HTML/PDF -> credit note, plus concurrency/immutability checks.
6. Review PDF pagination/long content and customer/tax display; review jurisdiction-specific compliance separately.
7. Run full CI on final branch head and review migration drift. Use disposable PostgreSQL only.

## Safety constraints
- Do not merge any PR without explicit user approval.
- Do not apply Finance migrations to a live database during this work.
- Never connect to or modify `zenoxfret_v2`.
- Preserve existing branches and work; no destructive Git operations.
- Do not claim completion or legal compliance until all criteria are verified.
