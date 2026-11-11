# Invoice tax snapshot binding — API contract v1

All endpoints are served by the independent ZENOX Finance API under `/api/v1`. Integration authentication uses the shared Finance client ID, bearer secret and explicitly granted tenant headers. Tenant identity is derived from the authenticated context; clients cannot choose a tenant in the request body.

## Calculate and attach tax evidence to a draft

### `POST /api/v1/invoices/drafts/:invoiceId/tax-snapshot`

**Required scopes:** `invoice:draft:write` and `tax:calculate`.

The endpoint calculates the effective rules for the requested active jurisdiction, category and tax date, applies the existing deterministic decimal tax engine per invoice line, records the full input/result/applied-rule evidence in an immutable tax snapshot, and attaches it to the matching draft revision in one tenant-scoped PostgreSQL transaction.

Request body (strict; unknown properties are rejected):

```json
{
  "expectedUpdatedAt": "2026-10-16T21:00:00.000Z",
  "taxDate": "2026-10-16",
  "jurisdictionId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "appliesTo": "FREIGHT"
}
```

`appliesTo` is one of `GOODS`, `SERVICES`, `DIGITAL_SERVICES`, `FREIGHT`, or `INSURANCE`. `expectedUpdatedAt` must match the current draft version. A stale/non-draft invoice is rejected; the client must reload before retrying.

Success: `201 { data: { snapshot, invoice, correlationId } }`. Decimal monetary values are returned as strings. `grandTotal` is the gross total including non-withholding taxes; `amountDue` is the net payable after withholding. The invoice retains `taxSnapshotId`, `taxSnapshotVersion`, `documentVersion` and `taxStatus = CALCULATED`.

Errors:
- `400 INVALID_INVOICE_ID` or `400 INVALID_REQUEST`: malformed identifier/body.
- `401 UNAUTHENTICATED`, `403 INSUFFICIENT_SCOPE`, or `403 TENANT_ACCESS_DENIED`: authentication/authorization failure.
- `409 INVOICE_NOT_FOUND_OR_CHANGED`: missing, stale or non-editable draft; reload the draft.
- `409 TAX_SNAPSHOT_ALREADY_EXISTS`: a snapshot already exists for that exact invoice revision.
- `422 CURRENCY_NOT_SUPPORTED`, `422 NO_ACTIVE_TAX_RULES`, `422 INCOMPATIBLE_TAX_PRICE_MODES`, `422 AMBIGUOUS_TAX_TYPES`, or a calculation validation code: the calculation was refused and no partial update is committed.
- `500 INTERNAL_ERROR`: unexpected failure, with correlation ID.

## Invariants

- Snapshot insertion, per-line calculated amounts, invoice totals and invoice linkage commit or roll back together.
- A snapshot must match the same tenant, invoice ID, document revision and `INVOICE` document type. PostgreSQL constraints and a trigger enforce this in addition to service checks.
- Snapshots are immutable. Draft edits increment `documentVersion`, clear the previous snapshot link and reset `taxStatus` to `PROVISIONAL`.
- The existing client-supplied tax rate on a newly created/edited draft remains **provisional** until this endpoint succeeds.
- No fallback tax rate is invented when rules are absent or incompatible.
- This endpoint applies configured rules; it does **not** certify tax compliance. Jurisdiction-specific rule sources and legal treatment require independent review.
- All migration and integration verification is restricted to disposable PostgreSQL in CI. Never apply Finance migrations to ZENOX FRET V2.
