-- Add extensible applicability and accounting semantics to Finance tax rules.
-- Additive only: existing rules remain valid. This migration must run only against
-- the dedicated ZENOX Finance database (disposable/test first), never ZENOX FRET.
ALTER TABLE public.finance_tax_rules
  ADD COLUMN IF NOT EXISTS accounting_treatment text NOT NULL DEFAULT 'TAX_CHARGED',
  ADD COLUMN IF NOT EXISTS applicability_conditions jsonb NOT NULL DEFAULT '{"schemaVersion":1,"all":[]}'::jsonb,
  ADD COLUMN IF NOT EXISTS source_verified_at date,
  ADD COLUMN IF NOT EXISTS reviewed_by text;

ALTER TABLE public.finance_tax_rules
  DROP CONSTRAINT IF EXISTS finance_tax_rules_accounting_treatment_check;
ALTER TABLE public.finance_tax_rules
  ADD CONSTRAINT finance_tax_rules_accounting_treatment_check
  CHECK (accounting_treatment IN (
    'TAX_CHARGED',
    'WITHHOLDING_DEDUCTION',
    'ADVANCE_INCOME_TAX',
    'RECOVERABLE_CREDIT',
    'NON_RECOVERABLE_COST',
    'CUSTOMS_COST',
    'OTHER'
  ));

ALTER TABLE public.finance_tax_rules
  DROP CONSTRAINT IF EXISTS finance_tax_rules_applicability_conditions_check;
ALTER TABLE public.finance_tax_rules
  ADD CONSTRAINT finance_tax_rules_applicability_conditions_check
  CHECK (
    jsonb_typeof(applicability_conditions) = 'object'
    AND applicability_conditions ? 'schemaVersion'
    AND applicability_conditions->>'schemaVersion' = '1'
    AND applicability_conditions ? 'all'
    AND jsonb_typeof(applicability_conditions->'all') = 'array'
  );

COMMENT ON COLUMN public.finance_tax_rules.accounting_treatment IS
  'Accounting meaning is distinct from calculation mechanics; for example Benin AIB may be classified as ADVANCE_INCOME_TAX rather than ordinary VAT.';
COMMENT ON COLUMN public.finance_tax_rules.applicability_conditions IS
  'Versioned, validated condition document. schemaVersion=1; all is an array of declarative conditions. Runtime must fail closed on unknown operators/fields.';
COMMENT ON COLUMN public.finance_tax_rules.source_verified_at IS
  'Date an authorized reviewer last verified the cited legal source. Active rules require this evidence.';
COMMENT ON COLUMN public.finance_tax_rules.reviewed_by IS
  'Non-secret identifier of the authorized reviewer who approved the source; not a user-supplied audit identity.';
