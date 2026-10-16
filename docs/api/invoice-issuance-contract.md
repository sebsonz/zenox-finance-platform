# Invoice issuance contract

## Endpoint

`POST /api/v1/invoices/:invoiceId/issue`

Required scope: `invoice:issue`. Tenant identity comes only from the authenticated Finance principal and transaction-local tenant context. The body is strict and contains `expectedUpdatedAt` from the current invoice representation.

## Preconditions and behavior

- The invoice must be a tenant-owned `DRAFT` at the exact expected timestamp.
- A tax snapshot must already be attached, and `tax_status` must be `CALCULATED`.
- At least one invoice line must exist.
- Number allocation is atomic per tenant and UTC calendar year. Format: `INV-YYYY-NNNNNN`. Concurrent calls cannot allocate the same sequence number.
- Number allocation, status transition, issue date and immutable audit fields are performed in the same transaction. A failed transaction rolls back the allocation.
- A stale revision or a repeated issue request returns `409`; missing tax evidence or missing lines returns `422`.
- Issued invoice rows and their lines are protected by PostgreSQL triggers against UPDATE/DELETE/INSERT mutations. Issued invoices are never edited in place. Corrections must use a separate credit-note/cancellation workflow; that workflow is not represented as complete by this endpoint.

## Important limitations

The current numbering policy is a technical default, not a claim that a particular jurisdiction's legal invoice numbering requirements have been validated. Prefix, fiscal-year policy, required legal fields, e-invoicing, document hash/signature and archival obligations must be configured and reviewed per jurisdiction before production use. This endpoint does not yet generate or store the immutable PDF/rendered document; that is the next invoice-lifecycle slice.
