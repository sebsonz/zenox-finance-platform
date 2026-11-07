# Platform Tax Administration — Global Rules API

## Endpoint

`GET /api/v1/user/platform/tax/rules`

This endpoint lists global reference rules only (`tenant_id IS NULL`). It is read-only.

### Authorization

- Existing authenticated user session via `requireUserAuth`.
- Confirmed email required.
- Active platform operator is verified using the existing `finance_is_active_platform_operator(issuer, subject)` database function.
- Tenant membership and client-provided role fields are not authorization inputs.

### Query parameters

| Parameter | Allowed values |
|---|---|
| `taxType` | VAT, GST, SALES_TAX, EXCISE, WITHHOLDING, CUSTOMS_DUTY, IMPORT_TAX, ENVIRONMENTAL, STAMP_DUTY, OTHER |
| `status` | DRAFT, ACTIVE, RETIRED |
| `search` | Rule code or name, max 100 characters |
| `page` | 1–10000, default 1 |
| `pageSize` | 1–100, default 25 |

### Response

Returns paginated rule records, including jurisdiction ID, category, treatment, rate, applicability, source reference, version and effective dates. No tenant-specific override is returned.

### Deliberate exclusions

This first API does not create, update, approve, publish, retire or delete global rules. It does not modify jurisdictions. Those actions require reviewed database grants/functions, audit guarantees and an approved migration plan. No migration or database change is included in this lot.


## Platform jurisdiction directory

`GET /api/v1/user/platform/tax/jurisdictions`

Returns the global jurisdiction reference, including active and inactive jurisdictions. The API delegates to `finance_list_platform_tax_jurisdictions(issuer, subject)`, a narrowly scoped `SECURITY DEFINER` function that re-checks active platform-operator status inside PostgreSQL. Browser-facing roles have no direct table/function grants.

Migration `20261107000100_platform_tax_reference_read_grants.sql` grants the trusted `finance_runtime` role SELECT on the two global reference tables only, while explicitly revoking browser-facing and service roles. Migration `20261107000200_platform_tax_jurisdiction_admin_read.sql` adds the operator-checked jurisdiction listing function. Both migrations are source-controlled only; they have not been applied to any database.

## Database readiness

- The base tax schema already has global-vs-tenant RLS predicates.
- The active-jurisdiction RLS policy intentionally hides inactive rows from direct SELECT; the platform directory therefore uses the operator-checked function.
- The tax rules table did not have an explicit `finance_runtime` SELECT grant in the current base migration set; the new grant migration addresses this without granting direct browser access.
- The operator predicate function and `finance_runtime` EXECUTE grant already exist in `20261024000200_platform_registration_review.sql`.
