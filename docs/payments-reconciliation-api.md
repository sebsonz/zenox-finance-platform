# Payment reconciliation API

All endpoints are tenant-scoped. The caller must use a valid ZENOX Finance integration principal and the scopes listed below. Requests are executed inside a transaction with the tenant context set locally; no endpoint accepts a caller-supplied tenant ID.

## Import statement rows

`POST /api/v1/payments/reconciliation/import`

Required scope: `reconciliation:manage`

Body:

```json
{
  "rows": [
    {
      "providerCode": "example-provider",
      "externalReference": "statement-transaction-001",
      "amount": "12500.00",
      "currencyCode": "XOF",
      "transactionDate": "2026-10-22T10:00:00Z",
      "safeMetadata": { "source": "csv" }
    }
  ]
}
```

A batch must contain 1–500 rows and cannot repeat the same provider/reference pair within that batch. The response includes batch ID and inserted/duplicate/conflict counts. The database unique key is tenant + provider + external reference. Re-importing an unchanged row is idempotent; a conflicting payload marks an unpaired row as `CONFLICT`. Existing `MATCHED` and `IGNORED` states are not overwritten by an import.

Only non-sensitive metadata should be supplied in `safeMetadata`. Do not include payment credentials, secrets, full card data, or unrelated personal data.

## List imported transactions

`GET /api/v1/payments/reconciliation?status=UNMATCHED&providerCode=example-provider&limit=25&cursor=<uuid>`

Required scope: `reconciliation:read`

Supported statuses: `UNMATCHED`, `MATCHED`, `CONFLICT`, `IGNORED`. Page size is 1–100. Results are restricted to the authenticated tenant.

## Match a transaction

`POST /api/v1/payments/reconciliation/:itemId/match`

Required scope: `reconciliation:manage`

Body may be empty for automatic matching, or may specify a payment ID for an explicit match:

```json
{ "paymentId": "11111111-1111-4111-8111-111111111111" }
```

A match requires a same-tenant payment with matching provider and external reference, a confirmed/settled status, and equal amount/currency. Ambiguous or mismatched candidates are marked `CONFLICT`; no candidate leaves an automatic match as `UNMATCHED`. Ignored items cannot be matched. A matched item cannot be silently rematched to another payment.

## Event history

- `GET /api/v1/payments/:paymentId/events?limit=25&cursor=<uuid>` — scope `payments:read`.
- `GET /api/v1/payments/:paymentId/refunds/:refundId/events?limit=25&cursor=<uuid>` — scope `refunds:read`.

The event endpoints expose the existing payment event ledger and filter refund history by its recorded refund ID. They do not mutate payments or refunds.

## Operational notes

- No payment provider is configured by these APIs. They import reconciliation data and match it to existing payments only.
- Production database privileges must be provisioned explicitly for the backend runtime role. RLS policies alone do not grant table privileges.
- Run typecheck, unit tests, disposable-PostgreSQL integration tests, migration drift checks, and the focused tenant-isolation/concurrency security review before marking this module validated.
