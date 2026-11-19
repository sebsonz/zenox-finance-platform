# Platform Tax Administration — API Contract

## Scope

The platform tax administration workspace manages the global tax reference across multiple countries and jurisdictions. It is separate from tenant-level tax assignments and tenant overrides.

All routes are mounted under `/api/v1/user/platform`. Browser clients call the Finance API only; there is no direct browser-to-database access.

## Authorization and security

- A valid authenticated user session is required.
- The identity must have a confirmed email and active platform-operator status.
- Mutating browser requests require a same-origin `Origin` header.
- Identity issuer and subject are taken from the verified session, never from request payloads.
- Every mutation carries the server-generated correlation ID and a reason where required.
- Database SECURITY DEFINER functions re-check operator/delegation permissions and enforce workflow invariants.
- A rule submitter cannot review their own submission. Review permission is checked by `finance_tax_actor_can(..., 'RULE_REVIEW', ...)`.
- The browser cannot set tenant scope, rule version, rule status, approval status, or reviewer identity.

## Global rules

### `GET /tax/rules`

Lists global rules only (`tenant_id IS NULL`). Supports:
- `taxType`: VAT, GST, SALES_TAX, EXCISE, WITHHOLDING, CUSTOMS_DUTY, IMPORT_TAX, ENVIRONMENTAL, STAMP_DUTY, OTHER
- `status`: DRAFT, ACTIVE, RETIRED
- `search`: rule code or name, max 100 characters
- `page`: 1–10000, default 1
- `pageSize`: 1–100, default 25

Returns version, legal source, accounting treatment, applicability conditions, source verification date and reviewer metadata.

### `POST /tax/rules`

Creates a global DRAFT through `finance_platform_create_global_tax_rule_draft`.
- Body: `{ rule, reason }`
- Legal `sourceReference` is required.
- The database assigns `tenant_id = NULL`, the next version, and `status = DRAFT`.
- The database serializes version allocation and writes the audit event.
- Client-supplied tenant ID, version and status are rejected.

### `POST /tax/rules/:ruleId/submit`

Submits a global DRAFT for review through `finance_submit_global_tax_rule_for_approval`.
- Returns `approvalId` and `PENDING_REVIEW`.
- Only a global DRAFT can be submitted.

## Approval workflow

### `GET /tax/approvals`

Lists global approval records and their rule-version snapshot. Supports status filters:
`PENDING_REVIEW`, `APPROVED`, `REJECTED`, `CANCELLED`, plus bounded page/pageSize.

### `POST /tax/approvals/:approvalId/review`

Reviews a pending approval through `finance_review_global_tax_rule`.
- Body: `{ decision: "APPROVE" | "REJECT", reason }`
- Rejection requires a 10–1000 character reason.
- Approval activates the exact submitted rule version atomically.
- Rejection leaves the rule inactive.
- Self-review and stale-version review are rejected.
- The decision and actor are written to the immutable platform tax audit stream.

## Jurisdiction reference administration

### `GET /tax/jurisdictions`

Lists active and inactive global jurisdictions through `finance_list_platform_tax_jurisdictions`.

### `GET /tax/jurisdiction-levels?countryCode=BJ`

Lists the configured hierarchy levels for one ISO-2 country code.

### `POST /tax/jurisdictions`

Creates or updates a global jurisdiction through `finance_platform_upsert_tax_jurisdiction`.
- Body fields: optional `id`, `code`, `countryCode`, `name`, `levelCode`, optional `parentId`, `isActive`, `reason`.
- The database checks configured level, country consistency, parent level, required parent, and hierarchy cycles.
- Every mutation is audited.

### `POST /tax/jurisdiction-levels`

Creates or updates a country's hierarchy level through `finance_platform_upsert_tax_jurisdiction_level`.
- Body fields: `countryCode`, `levelCode`, `label`, optional `parentLevelCode`, `sortOrder`, `isRequired`, `isActive`, `reason`.
- The database checks parent existence and hierarchy cycles and writes the audit event.

## Audit

### `GET /tax/audit`

Returns paginated global tax-rule and jurisdiction administration events from `finance_platform_tax_audit_events`, including actor, action, resource, reason, correlation ID, safe metadata and timestamp.

## Workflow invariants

- New rules are drafts and never become effective at creation time.
- Rule versions are assigned by the database; a revision is created as a new version, not by mutating an existing version.
- Submission captures the exact rule version.
- Approval requires a different reviewer and activates only the submitted version.
- Rejected rules remain inactive.
- Jurisdiction and hierarchy writes use the installed audited database functions.
- No migration is introduced or applied by this implementation tranche. The API uses the existing schema and installed functions; any missing database privilege or read-path requirement must be separately reviewed before database changes.

## Error handling

The API maps authorization, invalid input, missing draft/approval, inactive jurisdiction, self-review, stale version, invalid hierarchy, and missing delegation permission to explicit 4xx responses. Unexpected database/runtime errors are passed to the central error handler.
