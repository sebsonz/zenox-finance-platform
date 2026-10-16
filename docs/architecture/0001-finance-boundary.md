# ADR-0001: Independent finance boundary

- Status: Accepted for the first milestone
- Date: 2026-10-16

## Decision

ZENOX Finance is a separately deployed service with a separately managed PostgreSQL database. ZENOX FRET V2 consumes it over a versioned service API.

Finance is authoritative for invoice identity, invoice lifecycle, line totals, tax snapshots, invoice numbering, payment records, payment allocations, paid amount, and balance due.

FRET remains authoritative for operational objects and sends stable external references (source system, source type, source ID) plus validated billing facts required by the invoice contract. Finance must not trust a FRET-provided calculated total where it can calculate from the submitted lines and its configured rules.

## Tenant identity

An authenticated integration principal is mapped server-side to permitted finance tenant(s) and scopes. A tenant ID in a request body is a selector at most; it is not authorization. Every read and write checks both the authenticated principal's allowed tenant and the record's tenant.

## Idempotency

Financial mutation endpoints require an idempotency key. Store tenant, operation, key, canonical request hash, result reference and status under a uniqueness constraint. Reuse with a different canonical request returns a conflict. Concurrent requests must converge on one result.

## Monetary precision

Use PostgreSQL NUMERIC for persisted amounts and a decimal arithmetic library in TypeScript for calculations. Currency-specific minor-unit and rounding rules are explicit configuration, never implicit binary floating-point arithmetic. API amounts are decimal strings.

## Issued invoices and payments

A draft can be edited subject to permissions and validation. Issuance captures immutable snapshots of customer, seller, line descriptions, quantities, unit prices, currency, tax rules/rates, rounding policy, totals, dates, and numbering decision. Issued documents are corrected through credit/correction workflows rather than silent edits.

Payments are records of money received or initiated; their statuses must distinguish pending, confirmed, failed, cancelled, and reversed as applicable. Only eligible confirmed amounts can be allocated. Allocation operations are atomic and cannot over-allocate either side.

## Audit and integration

Audit records include actor/service principal, tenant, action, resource, timestamp, correlation ID and safe change metadata. Never store authorization tokens, secrets, or full payment credentials in logs.

Events/webhooks are at-least-once and therefore require consumer deduplication. Reconciliation endpoints/jobs must be designed for eventual recovery from timeouts and partial network failures.

## Not included in the first milestone

- Claim of worldwide fiscal compliance
- Full general ledger/accounting suite
- Card/mobile money gateway execution or settlement unless a separately validated provider integration is added
- Automatic tax/legal conclusions without a validated jurisdiction rule pack
