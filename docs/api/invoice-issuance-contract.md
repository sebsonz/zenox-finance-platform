# Invoice issuance contract

## Endpoint

`POST /api/v1/invoices/:invoiceId/issue`

Required scope: `invoice:issue`. Tenant identity comes only from the authenticated Finance principal and transaction-local tenant context. The body is strict and contains `expectedUpdatedAt` from the current invoice representation. A required `Idempotency-Key` header (8–128 characters) makes retries safe: the same key and same invoice revision return the already-issued invoice; reusing the key for another invoice or revision returns `409`.

## Preconditions and behavior

- The invoice must be a tenant-owned `DRAFT` at the exact expected timestamp. Drafts support 1–500 lines, each with its own quantity, unit price, discount and tax rate; the backend calculates line and invoice totals with decimal arithmetic.
- A tax snapshot must already be attached, and `tax_status` must be `CALCULATED`.
- At least one invoice line must exist.
- Number allocation is atomic per tenant and UTC calendar year. Format: `INV-YYYY-NNNNNN`. Concurrent calls cannot allocate the same sequence number.
- Number allocation, status transition, issue date, immutable audit fields, the server-rendered HTML artifact, and the generated PDF artifact are persisted in the same transaction. A failed render or artifact insert rolls issuance back. Both artifacts store SHA-256 hashes, are immutable at the database layer, and are hash-verified when retrieved.
- A stale revision returns `409`; a different idempotency key on a previously issued draft also conflicts. Repeating a successful request with the same idempotency key returns the same issued invoice and does not create a second set of documents. Missing tax evidence or missing lines returns `422`.
- Issued invoice rows and their lines are protected by PostgreSQL triggers against mutation. The HTML artifact is retrieved using `GET /api/v1/invoices/:invoiceId/document`; the PDF attachment is retrieved using `GET /api/v1/invoices/:invoiceId/document.pdf`. Both require `invoice:read`, are tenant-scoped, hash-verified on retrieval, immutable, and served with private no-store caching. Issued invoices are never edited in place. Corrections must use a separate credit-note/cancellation workflow; that workflow is not represented as complete by this endpoint.

## Important limitations

The current numbering policy is a technical default, not a claim that a particular jurisdiction's legal invoice numbering requirements have been validated. Prefix, fiscal-year policy, required legal fields, e-invoicing, PDF generation, document signature and archival obligations must be configured and reviewed per jurisdiction before production use. The PDF renderer uses a built-in PDF 1.4 writer with standard Helvetica and currently normalizes non-ASCII characters for broad compatibility; it is a technical printable artifact, not a jurisdictional legal-compliance certification. Legal formatting, mandatory fields, signatures and archival policy require jurisdictional review.


## Full-reversal credit notes

Create a full-reversal credit note with `POST /api/v1/invoices/:invoiceId/credit-notes`, required scope `invoice:credit`, and strict JSON body `{"reason":"..." }`. Only an issued source invoice with its original tax snapshot can be reversed. The credit note copies the original customer, line and tax-evidence references, uses a distinct `CN-YYYY-NNNNNN` number, and stores immutable HTML/PDF renditions with hashes. The original issued invoice and its artifacts remain unchanged.

The current credit-note operation is deliberately **full reversal only**, with at most one credit note per source invoice. Partial credit notes, debit notes, replacement invoices, approval workflow and jurisdiction-specific credit-note requirements are not implemented by this endpoint and must not be inferred from it. The copied tax snapshot is source evidence; tax treatment for a real-world credit note must be confirmed for the relevant jurisdiction before production use.

Retrieve credit-note renditions using `GET /api/v1/invoices/credit-notes/:creditNoteId/document` or `GET /api/v1/invoices/credit-notes/:creditNoteId/document.pdf`, with `invoice:read`.
