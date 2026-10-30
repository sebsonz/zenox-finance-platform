# Customer and currency API contracts — v1

All endpoints are served by the Finance API under `/api/v1`. Integration service authentication uses the existing headers:

- `x-finance-client-id`: configured integration principal code;
- `Authorization: Bearer <secret>`: secret is validated using the stored SHA-256 digest;
- `x-finance-tenant-id`: tenant must be in that principal's explicit grant list and active.

The API never accepts `tenantId` from request bodies or query strings. The tenant comes only from the authenticated integration context and is applied transaction-locally for customer database operations.

## Customers

### `POST /api/v1/customers`

Required scope: `customer:write`. Creates one tenant-scoped customer using the strict `createCustomerSchema`. The API rejects unknown fields and client-supplied totals. The server validates a supplied default currency against active Finance reference data.

Success: `201 { data: { customer, correlationId } }`.
Duplicate tenant-local customer code or external identity: `409`.
Unsupported currency: `422`; invalid body: `400`.

### `GET /api/v1/customers?q=&status=ACTIVE&limit=25&cursor=<uuid>`

Required scope: `customer:read`. The supported filters are substring search over legal name/customer code, `ACTIVE|ARCHIVED` status, limit 1–100 and an opaque UUID cursor (last returned customer ID). Results are ordered by ascending UUID and request `limit + 1` rows to determine whether a next page exists.

Success: `200 { data: { customers, page: { limit, hasMore, nextCursor }, correlationId } }`.
When `hasMore` is false, `nextCursor` is `null`; otherwise it is the final ID in the returned page. Pass that value unchanged as `cursor` for the next page. Search/filter values must be repeated on subsequent pages.

### `GET /api/v1/customers/:customerId`

Required scope: `customer:read`. Returns the customer only within the authenticated tenant's transaction/RLS context. Invalid UUID: `400`; missing or foreign-tenant customer: `404`.

### Customer update and archive

- PATCH /api/v1/customers/:customerId — scope customer:write; validates a strict partial update of mutable profile fields. Customer code and external identity remain stable through this endpoint. An empty patch is rejected.
- POST /api/v1/customers/:customerId/archive — scope customer:write; changes ACTIVE to ARCHIVED idempotently instead of physically deleting the customer.

Archived customers remain available for historical references and cannot receive new contacts or addresses. Updating an archived customer returns 409. A supplied default currency is checked against active Finance currency reference data.

### Customer contact and address lifecycle

- PATCH /api/v1/customers/:customerId/contacts/:contactId — scope customer:write; strict partial update of an active contact.
- POST /api/v1/customers/:customerId/contacts/:contactId/archive — scope customer:write; soft-archives the contact.
- PATCH /api/v1/customers/:customerId/addresses/:addressId — scope customer:write; strict partial update of an active address.
- POST /api/v1/customers/:customerId/addresses/:addressId/archive — scope customer:write; soft-archives the address.

Archived relations are retained for history and cannot be updated through these endpoints. Tenant identity is taken from the verified integration context; relation IDs must be UUIDs. A relation not found within the tenant/customer scope returns 404, malformed payloads return 400, and duplicate active primary records return 409.

### Customer contacts

- POST /api/v1/customers/:customerId/contacts — scope customer:write; creates a contact for an active customer.
- GET /api/v1/customers/:customerId/contacts?status=ACTIVE&limit=25&cursor=<uuid> — scope customer:read; bounded cursor pagination.

Contacts support GENERAL, BILLING, TECHNICAL, LEGAL and OTHER types. Contact name is required; email, phone and job title are optional. Only one active primary contact per customer is permitted. Contact rows use tenant-scoped RLS and a composite foreign key to the owning tenant/customer.

### Customer addresses

- POST /api/v1/customers/:customerId/addresses — scope customer:write; creates an address for an active customer.
- GET /api/v1/customers/:customerId/addresses?status=ACTIVE&limit=25&cursor=<uuid> — scope customer:read; bounded cursor pagination.

Address types are REGISTERED, BILLING, SHIPPING and OTHER. Address line 1, city and two-letter country code are required. A primary address is unique per customer and address type. Address rows use tenant-scoped RLS and a composite foreign key to the owning tenant/customer.

These endpoints reject unknown request fields, validate customer UUIDs and never accept tenant identity from client input. Missing/foreign-tenant customer returns 404; archived customer cannot receive new contacts or addresses (422); duplicate primary records return 409.

## Currencies

### `GET /api/v1/currencies`

Required scope: `currency:read`. Returns only rows where `is_active = true`, ordered by ISO-like currency code. The reference data is Finance-owned and read-only for integration runtime roles. Currency writes are not exposed in this API; changing reference data requires a reviewed migration/update process.

Success: `200 { data: { currencies, count, correlationId } }`.

## Error envelope

Authentication and authorization use the shared middleware responses (`401 UNAUTHENTICATED`, `403 INSUFFICIENT_SCOPE`, `403 TENANT_ACCESS_DENIED`). Validation errors have stable `400` codes; unexpected server errors use the application's generic `500 INTERNAL_ERROR` envelope and correlation ID.

## Authenticated user customer workspace

The user-session API is mounted under `/api/v1/user` and uses the HttpOnly Finance session cookie or a verified bearer token. Tenant ID is a route parameter only; it is not trusted until the backend confirms an ACTIVE membership and ACTIVE tenant.

Base: `/api/v1/user/tenants/:tenantId/customers`

- GET `/`, GET `/:customerId`, GET `/:customerId/contacts`, GET `/:customerId/addresses`: require `customers:read`.
- POST `/`, PATCH `/:customerId`, POST `/:customerId/archive`: require `customers:manage`.
- POST/PATCH/archive under `/:customerId/contacts` and `/:customerId/addresses`: require `customers:manage`.

The current role matrix grants `customers:manage` to OWNER, ADMIN and FINANCE_MANAGER. FINANCE_OPERATOR receives read-only customer access; VIEWER remains read-only. Every user mutation derives a USER actor from verified identity issuer + subject + active membership ID. The browser cannot supply actor identity. Customer, contact and address audit events are written to `finance_audit_events` in the same tenant transaction as each mutation.

The customer workspace provides list/search/detail and create/update/archive flows for customers, contacts and addresses. Currency reference data remains owned by M06 and must be active before a customer default currency is accepted.

Currency reference data remains Finance-owned and read-only for integration runtime roles. This document describes API contracts, not permission to apply migrations to a persistent database or deploy the feature.
