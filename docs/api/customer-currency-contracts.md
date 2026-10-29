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

These contracts cover the API surface added in the initial customer/currency vertical slice; they do not imply that update/archive/customer UI or live database population of currency reference data is complete.
