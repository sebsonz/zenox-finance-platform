# International Tax Engine — scope and safety contract

## Goal

ZENOX Finance models tax calculation independently of logistics products. This module is a configurable calculation and rule engine, not a claim that every jurisdiction's laws are already implemented or legally certified.

## Core concepts

- **Jurisdiction:** country, state/province/region, city, or special zone. Jurisdictions may be hierarchical.
- **Tax rule:** versioned rule with an effective date range, tax type, treatment, rate, priority, compounding flag, applicable transaction category, and source reference.
- **Tax treatment:** standard, reduced, zero-rated, exempt, reverse charge, or withholding.
- **Tax type:** VAT, GST, sales tax, excise, withholding, customs duty, import tax, environmental tax, stamp duty, and extensible other taxes.
- **Price mode:** exclusive (tax added to base) or inclusive (tax extracted from gross price).
- **Tax stack:** ordered tax components on a single invoice line. Compound taxes use the base plus previously calculated taxes; non-compound taxes use the base. The order is explicit and must be preserved.
- **Withholding:** deducted from amount due, while remaining separate from supplier-charged tax and invoice gross total.
- **Invoice snapshot:** immutable record of rule IDs/versions, jurisdiction, source reference, rates, taxable bases, rounded amounts, calculation policy, and currency precision used at issuance.

## Calculation contract

- Monetary arithmetic uses Decimal, never binary floating-point arithmetic.
- Currency precision is sourced from Finance's currency reference table, not trusted from a client.
- Rounding policy is versioned. Current calculation policies are TAX_EXCLUSIVE_HALF_UP_V1 and TAX_STACK_HALF_UP_V1.
- Tax components are applied in explicit order. Changing tax priority or composition can change the result and must not silently rewrite an issued invoice.
- Exempt, zero-rated and reverse-charge treatments do not add supplier-collected tax in the current engine. Reverse-charge reporting and declaration are separate obligations.
- Withholding is not VAT and must not be merged into the tax total.
- Negative amounts, credit notes, refunds, tax adjustments, and jurisdiction-specific rounding exceptions require explicit document workflows and policy tests; do not bypass input validation to represent them.
- A schema or generic engine feature is not evidence that a jurisdiction's tax rule is legally correct.

## Required jurisdiction onboarding checklist

Before a jurisdiction is enabled for production:
1. Confirm authoritative primary sources and publication/effective dates.
2. Validate applicable taxes by goods/services/digital services/freight/insurance/imports.
3. Validate registration thresholds, place-of-supply, customer tax status, exemptions, reverse charge, withholding and tax identifiers where applicable.
4. Validate inclusive pricing, compound order, taxable base, discounts, shipping, rounding level and currency precision.
5. Validate invoices, credit notes, refunds, cross-border transactions, and required reporting fields.
6. Add representative fixtures from the jurisdiction's official examples or reviewed tax calculations.
7. Have a qualified local tax professional review the implementation before representing the jurisdiction as supported.

## Security and lifecycle

- Global reference rules use tenant_id IS NULL and are intended to be maintained only through reviewed migrations/admin workflows.
- Tenant-specific overrides require app.tenant_id transaction context and are tenant-isolated by RLS.
- Runtime database roles must be non-superuser and must not have BYPASSRLS.
- Never trust tenant IDs, rates, currency precision, or rule versions supplied by a consumer.
- Issued invoice tax snapshots must be immutable. Corrections should use credit notes or replacement documents according to jurisdiction policy.
- Source references and rule changes should be audit logged.

## Not yet claimed as implemented

The current code does not yet provide comprehensive official rates for all countries, tax nexus/place-of-supply determination, registration-threshold monitoring, digital-service location evidence, tax return generation, customs tariff classification, treaty eligibility, withholding certificates, e-invoicing clearance, or legal certification. These must be implemented and verified separately before enabling affected jurisdictions.
