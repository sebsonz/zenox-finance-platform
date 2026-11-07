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
