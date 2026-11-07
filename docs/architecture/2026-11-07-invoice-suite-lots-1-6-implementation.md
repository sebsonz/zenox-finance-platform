# Invoice Suite — Lots 1–6 implementation map

Branch: `feat/invoice-suite-lots-1-6`

This branch is additive and independent of ZENOX FRET. No hosted database migration has been applied. The final test campaign is intentionally deferred until all six lots are complete.

## Lot 1 — Professional invoices
- Invoice draft metadata includes document title, references, purchase order, contract, payment terms, payment method, delivery date, service period, language and footer.
- Lines support ITEM, SERVICE, FEE and EXPENSE classifications.
- Line discounts and document-level percentage/fixed discounts are calculated with Decimal arithmetic and allocated proportionally before tax calculation.
- Seller/customer snapshots include available party and address details.
- HTML/PDF renderers include invoice classification, source references and line classification.
- Advance and balance invoice classifications are stored in immutable document metadata.

## Lot 2 — Quotes
- Separate quote and quote-line aggregates, quote numbering, tenant RLS and lifecycle guards.
- Draft creation, send confirmation, accept, reject, expire and convert accepted quote to an invoice draft.
- Conversion is replay-safe.
- Sending currently records operator-confirmed external delivery; SMTP/provider delivery is not wired in this branch.
- Sent quotes receive immutable HTML artifacts and can be downloaded.

## Lot 3 — Pro forma
- Separate non-fiscal pro forma aggregate, sequence, RLS and lifecycle guard.
- Draft creation, issue and immutable HTML artifact.
- Conversion to a fiscal invoice draft is recorded in a separate immutable conversion ledger.
- Pro forma never receives a fiscal invoice number or tax snapshot.

## Lot 4 — Advances, balances and payments
- Tenant user APIs support manual payment entry, confirmation, payment allocation, allocation reversal, payment events, refund request/approval/manual completion, refund history and invoice balance.
- User operations preserve the authenticated user actor; integration operations preserve the service principal actor.
- Advance invoice amounts must be confirmed/allocated before application to a balance invoice.
- Advance application reduces the balance invoice receivable; database guards prevent over-application and prevent reversing advance allocations already applied to a balance invoice.
- Payment provider adapters and bank feed reconciliation UI remain separate integration work; manual payment workflows are available.

## Lot 5 — Corrections
- Existing immutable full-reversal credit notes remain available.
- New immutable partial credit notes and debit notes reference source invoice lines and tax snapshot.
- Credit value is capped cumulatively across legacy full notes and new partial notes.
- Debit-note quantities are additional quantities priced using the source invoice line and tax snapshot.
- Refunds remain separate from credit notes.
- Adjustment HTML artifacts are generated and hashed at issuance. A dedicated adjustment PDF renderer is not yet included.

## Lot 6 — Recurring invoicing
- Tenant-scoped recurring schedules with frequency, interval, start/end dates, due-day policy, lines, status and next-run date.
- Draft, activate, pause, cancel and generate-next operations.
- Generation is transactionally locked and idempotent by schedule/date; generated invoices are drafts and still require tax calculation and issuance.
- A background scheduler/worker is not included yet; generation is currently operator-triggered from the workspace.

## Database migrations added
- `20261107000100_professional_invoice_document_metadata.sql`
- `20261107000200_quotes_and_proforma_documents.sql`
- `20261107000300_invoice_advances_adjustments_and_recurring.sql`
- `20261107000400_invoice_advance_applied_amount.sql`
- `20261107000500_commercial_ledger_guards.sql`
- `20261107000600_invoice_line_classification.sql`
- `20261107000700_proforma_invoice_conversion.sql`
- `20261107000800_recurring_and_conversion_immutability.sql`
- `20261107000900_advance_invoice_type_guard.sql`
- `20261107001000_balance_invoice_advance_offsets.sql`
- `20261107001100_protect_applied_advances_from_reversal.sql`
- `20261107001200_unified_credit_note_limit.sql`
- `20261107001300_commercial_document_artifacts.sql`

## Final validation gate
Do not merge this branch or apply its migrations to a hosted database until the single agreed final campaign is complete. The campaign must include:
1. TypeScript typecheck and production builds for backend/frontend.
2. All unit and integration tests, including payment, refund, quote/pro forma, adjustments, recurring generation and advance/balance allocation.
3. Full migration application and drift checks on disposable PostgreSQL only.
4. Tenant-isolation/RLS tests, immutability tests, idempotency/concurrency tests and permission tests.
5. Manual browser walkthrough of invoice, quote, pro forma, payments, corrections, advances and recurring workspaces.

No test execution is recorded as part of this implementation checkpoint.
