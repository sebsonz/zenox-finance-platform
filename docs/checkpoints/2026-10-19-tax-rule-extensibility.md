# Tax Rule Extensibility — design and implementation checkpoint

Date: 2026-10-19
Branch: `feature/tax-rule-extensibility`
Base: invoice workflow head `758e131bf5eaf8c2c41de01baef807b7daa7825b`

## Objective

Allow ZENOX Finance to represent tax rules that were omitted from the initial catalogue, including jurisdiction-specific levies and advance tax mechanisms such as Benin's AIB, without hardcoding each tax in application code. Extensibility does not mean arbitrary unvalidated formulas or legal compliance by default.

## Existing capabilities verified

- `finance_tax_jurisdictions` supports country/state/province/region/city/special-zone hierarchy.
- `finance_tax_rules` supports versioned rates, validity dates, priority, price mode, compounding, applicability category, source reference and DRAFT/ACTIVE/RETIRED status.
- Current `tax_type` enum includes VAT/GST/sales tax/excise/withholding/customs/import/environmental/stamp/other.
- The calculation engine uses Decimal, supports ordered percentage components, inclusive/exclusive price mode and treats WITHHOLDING as a deduction from amount due.
- Tax snapshots preserve selected rule details and are immutable.
- Global reference rules are read-only to tenants by RLS; tenant overrides are tenant-scoped.

## Gaps identified

- There is no general, versioned rule-condition document for factors such as transaction type, taxpayer registration/IFU status, supplier/customer status, or import/domestic operation.
- Accounting semantics are currently conflated with the tax family/treatment. An advance against income tax (such as AIB) must remain distinguishable from VAT and from a final tax expense.
- Source metadata is optional and there is no schema-level gate requiring review evidence before a new rule becomes ACTIVE.
- No verified rule-administration API/UI was found in the inspected code. Global reference data should not be editable by ordinary tenant users.
- The current calculation engine is percentage-based; fixed amounts, brackets, thresholds, and multi-step conditional formulas must not be advertised as supported until explicitly implemented and tested.

## Additive migration started

Migration `20261019000100_tax_rule_extensibility.sql` adds:
- `accounting_treatment` values including `ADVANCE_INCOME_TAX`, `WITHHOLDING_DEDUCTION`, `RECOVERABLE_CREDIT`, `CUSTOMS_COST`, and generic categories;
- `applicability_conditions` as versioned JSON with `schemaVersion: 1` and an `all` array;
- `source_verified_at` and `reviewed_by` metadata;
- review-evidence columns for future activation validation. A database-wide activation constraint is deliberately deferred until legacy rules are inventoried/backfilled, avoiding failures when an existing ACTIVE rule is updated.

The migration is committed on this feature branch only. It has NOT been applied to any database. It must be validated on disposable PostgreSQL and must never be run against `zenoxfret_v2`.

## Additional implementation added in this continuation

- Added `tax-applicability.schema.ts`: strict Zod schema for a bounded set of condition fields and EQ/IN operators. Unknown properties/operators are rejected; arbitrary expressions are not supported.
- Added `tax-applicability.service.ts`: fail-closed condition matching (missing facts do not match), case-normalized string comparisons, and deterministic precedence resolution.
- Extended the tax calculation request with optional validated `taxFacts` such as transaction type, IFU registration status, customer/supplier country, import/export and goods category.
- Extended the tax rule repository to load applicability conditions and accounting treatment, and moved override resolution after condition matching so a non-matching tenant override does not shadow a matching global rule.
- The calculation service filters candidates by validated facts before resolving precedence and records business facts plus accounting/applicability metadata in the immutable snapshot.
- Added unit tests for matching, missing facts, allow-lists, unsupported/executable-shaped conditions, override precedence, schema bounds and supported business facts.
- These commits are in GitHub on this branch. CI has not yet been confirmed for this head; do not treat the code as validated until a full workflow passes.

## Required follow-up before this can be called complete

1. Implement a strict Zod schema for condition fields/operators and reject unknown fields/operators. Never execute arbitrary SQL or JavaScript from rule JSON.
2. Extend tax rule row mapping, repository queries, and snapshot applied-rule records with the new metadata.
3. Define a tax-rule administration API with separate permissions for tenant-owned custom rules and platform-managed global reference rules. Ordinary tenant users must not edit global rules.
4. Add an approval lifecycle and audit trail for create/update/activate/retire; every edit creates a new rule version instead of mutating a rule used by issued documents.
5. Implement matching semantics and deterministic precedence for conditions; no matching/ambiguous rules must fail closed.
6. Add explicit tax accounting classification and tests for withholding/advance-income-tax so AIB is not added to VAT or misrepresented as a final tax.
7. Add integration tests for effective-date boundaries, overlapping rules, precedence, tenant isolation, missing/unknown conditions, audit, immutable snapshots, and migration drift.
8. Add reviewed Benin AIB fixtures from official DGI/CGI sources. Do not seed guessed legal rates as active rules; verify each rate's scope, taxable base, exemptions, taxpayer-registration conditions and effective dates with a qualified local reviewer.
9. Add France and other jurisdictions only with equivalent reviewed sources and representative tests.
10. Run CI on this branch and update this checkpoint with actual results.

## Safety

- No live database was changed.
- `zenoxfret_v2` was not accessed.
- No PR has been opened or merged by this checkpoint.
- Do not claim any jurisdiction legally compliant based only on schema or passing generic engine tests.
