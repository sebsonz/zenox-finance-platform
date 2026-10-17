# User-facing invoice read API

**Status:** First secure read-only API slice; not yet wired to the demo UI.

## Endpoint

`GET /api/v1/user/tenants/:tenantId/invoices`

Optional query parameters are the same bounded filters used by the internal invoice list:
- `status`: `DRAFT`, `ISSUED`, or `CANCELLED`
- `limit`: integer from 1 to 100; defaults to 25
- `cursor`: invoice UUID

The endpoint returns the tenant-scoped invoice rows and a page object with the returned count and an optional `nextCursor`. When a page is full, clients may request the next page with that cursor; the next page may be empty if the result set ended exactly on the page boundary. It never accepts client-supplied totals, status changes, or tenant permissions.

## Authorization sequence

1. Verify the Supabase access token server-side with `requireUserAuth()`.
2. Resolve the active membership using the verified issuer and subject, not a client-supplied identity.
3. Require the `invoices:read` permission from the authoritative Finance role model.
4. Confirm the tenant is active.
5. Execute the list query in a transaction with transaction-local `app.tenant_id` and rely on the existing forced RLS policy.
6. Return a bounded response and safe errors.

No integration bearer token, database URL, service-role key, or privileged secret is exposed to the browser.

## Deliberate scope boundary

This endpoint is read-only. Draft creation/editing, issuance, document generation, and credit-note actions remain unavailable to user sessions until the full BFF/session design and write-actor audit model are implemented and tested. The current demo UI is not yet connected to this endpoint.

Validation must run through GitHub Actions against disposable PostgreSQL. Do not run migrations or test preparation against the live Finance Supabase project, and never use the ZENOX FRET V2 database.
