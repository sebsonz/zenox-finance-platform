-- Enforce separate uniqueness domains for global reference rules and tenant overrides.
-- Global rule versions must be unique even though tenant_id is NULL.
CREATE UNIQUE INDEX IF NOT EXISTS finance_tax_rules_global_version_uq
  ON public.finance_tax_rules (jurisdiction_id, rule_code, version)
  WHERE tenant_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS finance_tax_rules_tenant_version_uq
  ON public.finance_tax_rules (tenant_id, jurisdiction_id, rule_code, version)
  WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS finance_tax_rules_effective_lookup_idx
  ON public.finance_tax_rules (jurisdiction_id, applies_to, valid_from, valid_to)
  WHERE status = 'ACTIVE';
