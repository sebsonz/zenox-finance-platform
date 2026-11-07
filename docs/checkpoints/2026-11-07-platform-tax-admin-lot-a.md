# Checkpoint — Platform Tax Administration Lot A

**Branch:** `feat/platform-tax-admin-center-lot-a`  
**Base:** `feat/invoice-lot1-professional-foundation`  
**Scope:** ZENOX Finance only. No ZENOX FRET database access.

## Implemented in code

- Added a platform tax rules read endpoint: `GET /api/v1/user/platform/tax/rules`.
- Authorization requires the authenticated, email-confirmed identity to be an active platform operator. Authorization uses verified issuer + subject.
- Separated route, platform access service, operator repository, tax rule repository and tax list use case.
- Global rule list explicitly restricts to `tenant_id IS NULL`.
- Added bounded pagination and parameterized tax type, status and text filters.
- Added a Tax Administration entry to the existing Platform Admin dashboard without changing its visual system.
- Added a real-data workspace for global tax rules, with explicit empty/error/loading states and pagination.
- Added unit tests for platform operator access and global rule query filtering/pagination.

## Not implemented in this lot

- No creation or editing of global rules.
- No approval, publication, activation, retirement or deletion.
- No jurisdiction create/update/activate/deactivate interface.
- No BJ tax data seeded or represented as legally verified.
- No tax declarations, returns or payment due-date workflows.
- No migrations, SQL DDL/DML, grants, seed data or persistent database changes.

## Important database readiness gate

The API reads existing global rows from `finance_tax_rules`. Its runtime database role must already have the required SELECT permission and the existing RLS policy must permit the global rows. If deployment returns a permission error, stop and prepare a separate migration/grant proposal for review; do not work around RLS or apply a migration without approval.

Jurisdiction listing and all global writes remain blocked until their grants and audited database functions are reviewed and approved.

## Validation still required

- Backend typecheck and unit tests.
- Frontend typecheck/build.
- Integration test against disposable PostgreSQL using the actual Finance runtime role.
- Browser test with an active platform operator and a non-operator identity.
- Confirm the API is not exposed to tenant members lacking platform operator authorization.
