# Finance API contract

The initial public API namespace is `/api/v1`. The OpenAPI document will be checked into this folder before the FRET adapter is implemented.

Minimum resource groups:
- tenant billing settings and supported currencies
- customers or customer references
- invoices and invoice lines (see [invoice tax snapshot binding contract](../api/invoice-tax-snapshot-contracts.md))
- tax profiles/rules and invoice tax snapshots
- payments
- payment allocations
- audit/reconciliation metadata

Every endpoint must document authentication, required scopes, tenant derivation, idempotency behavior, conflict behavior, response schema, and error codes. The API must return decimal amounts as strings and expose authoritative amounts/statuses from Finance, not FRET-calculated guesses.
