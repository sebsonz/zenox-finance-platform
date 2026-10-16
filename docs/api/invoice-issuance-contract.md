# Invoice issuance contract

## Endpoint

`POST /api/v1/invoices/:invoiceId/issue`

Required scope: `invoice:issue`. Tenant identity comes only from the authenticated Finance principal and transaction-local tenant context. The body is strict and contains `expectedUpdatedAt` from the current invoice representation.

## Preconditions and behavior

- The invoice must be a tenant-owned `DRAFT` at the exact expected timestamp.
- A tax snapshot must already be attached, and `tax_status` must be `CALCULATED`.
- At least one invoice line must exist.
- Number allocation is atomic per tenant and UTC calendar year. Format: `INV-YYYY-NNNNNN`. Concurrent calls cannot allocate the same sequence number.
- Number allocation, status transition, issue date, immutable audit fields, and the server-rendered HTML artifact are persisted in the same transaction. A failed render or artifact insert rolls issuance back. The artifact stores a SHA-256 content hash and is immutable at the database layer.
- A stale revision or a repeated issue request returns `409`; missing tax evidence or missing lines returns `422`.
- Issued invoice rows and their lines are protected by PostgreSQL triggers against mutation. The corresponding HTML document artifact is tenant-scoped, hash-verified on retrieval, and immutable. Retrieve it using `GET /api/v1/invoices/:invoiceId/document` with `invoice:read`. Issued invoices are never edited in place. Corrections must use a separate credit-note/cancellation workflow; that workflow is not represented as complete by this endpoint.

## Important limitations

The current numbering policy is a technical default, not a claim that a particular jurisdiction's legal invoice numbering requirements have been validated. Prefix, fiscal-year policy, required legal fields, e-invoicing, PDF generation, document signature and archival obligations must be configured and reviewed per jurisdiction before production use. The stored HTML is printable and immutable but is not a PDF or a legal-compliance certification.
