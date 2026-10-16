# ZENOX Finance

Independent financial services platform for invoicing, payment records, payment allocations, balances, tax snapshots, and integration with ZENOX FRET V2.

## Initial delivery objective

The first milestone is a secure, testable finance foundation that ZENOX FRET V2 can consume through a versioned API. It is not a claim of worldwide fiscal compliance.

## Boundaries

- **ZENOX Finance owns:** invoice lifecycle, invoice lines, tax calculations and snapshots, numbering, payment records, allocations, balances, audit trail, and financial API.
- **ZENOX FRET V2 owns:** logistics customers and operational records such as quotes, bookings, shipments, and delivery evidence.
- FRET must request financial operations through the Finance API; it must not independently calculate, number, issue, or mutate Finance-owned invoices.
- FRET subscription billing is separate from invoices issued to FRET customers.

## Non-negotiable invariants

1. Every tenant-owned record is scoped to one finance tenant.
2. Tenant identity for service calls comes from authenticated service credentials and server-side authorization, never from an untrusted body field alone.
3. Financial writes are transactional and retry-safe through idempotency keys.
4. Use PostgreSQL exact numeric arithmetic for monetary values. Do not use JavaScript `Number` for financial calculations.
5. Issued invoice content, applied tax rules, currency and rounding decisions are immutable snapshots. Corrections use explicit controlled operations.
6. Payment allocation cannot exceed the eligible unapplied payment amount or the invoice's remaining receivable balance.
7. Repeated callbacks or retries must not create duplicate invoices, payments, allocations, or ledger effects.
8. Security-sensitive actions are auditable without logging secrets or unnecessary payment data.
9. API changes are versioned and documented. Cross-tenant access must fail closed.
10. No production secret, credential, real customer data, or database dump belongs in this repository.

## Planned technology baseline

- Node.js 22 LTS line, TypeScript, strict compiler settings
- PostgreSQL (including Supabase-hosted PostgreSQL where appropriate)
- Versioned REST API
- Automated unit, integration, authorization, idempotency, concurrency, and migration tests
- Environment-based configuration validated at startup

Exact framework choices and deployment topology are to be recorded in architecture decisions before being relied on by consumers.

## First end-to-end acceptance scenario

1. An authorized ZENOX FRET V2 service requests an invoice for an eligible operational source.
2. Finance validates the service identity, tenant, customer reference, currency, invoice lines, tax configuration, and idempotency key.
3. Finance creates the invoice atomically and returns a stable Finance invoice ID and status.
4. FRET retrieves the invoice and its authoritative total.
5. Finance records a payment and allocates it to that invoice.
6. FRET reads the updated paid amount, balance due, and invoice/payment status.
7. Repeating the original requests does not duplicate financial effects; attempts to cross tenant boundaries are rejected.

## Scope and compliance

Tax and invoice rules must be configurable, dated, and versioned. The legal behavior for each supported country must be researched and validated before claiming compliance. The first milestone should only enable explicitly configured and tested jurisdictions.

## Working rules

- Build and validate Finance independently from the FRET database.
- Do not perform destructive schema changes against ZENOX FRET V2.
- Do not merge FRET's legacy invoice/payment engine into Finance; create an explicit API adapter after Finance's contract is stable.
- Every milestone ends with executable tests and a checkpoint describing what passed, failed, and remains unverified.
