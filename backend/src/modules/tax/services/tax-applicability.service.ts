import type { TaxApplicabilityConditions, TaxBusinessFacts } from "../validators/tax-applicability.schema.js";
import { taxApplicabilityConditionsSchema } from "../validators/tax-applicability.schema.js";

function normalize(value: string | boolean): string | boolean {
  return typeof value === "string" ? value.trim().toUpperCase() : value;
}

/** Missing facts never satisfy a condition. Unknown fields/operators are rejected by Zod. */
export function matchesTaxApplicability(
  rawConditions: unknown,
  facts: TaxBusinessFacts,
): boolean {
  const conditions: TaxApplicabilityConditions = taxApplicabilityConditionsSchema.parse(rawConditions);
  return conditions.all.every((condition) => {
    const fact = facts[condition.field];
    if (fact === undefined) return false;
    const normalizedFact = normalize(fact);
    if (condition.operator === "EQ") {
      return normalizedFact === normalize(condition.value);
    }
    return condition.value.some((candidate) => normalizedFact === normalize(candidate));
  });
}

/**
 * Resolve active rules only after applicability matching. A tenant override shadows
 * a global rule with the same code only if the tenant override itself matches.
 * A category-specific rule shadows ALL-category counterpart for the same code.
 */
export function resolveApplicableTaxRulePrecedence<T extends {
  readonly ruleCode: string;
  readonly tenantId: string | null;
  readonly appliesTo: string;
  readonly version: number;
  readonly priority: number;
}>(
  candidates: readonly T[],
  appliesTo: string,
): T[] {
  const selected = new Map<string, T>();
  const ordered = [...candidates].sort((a, b) =>
    Number(b.appliesTo === appliesTo) - Number(a.appliesTo === appliesTo) ||
    Number(a.tenantId === null) - Number(b.tenantId === null) ||
    b.version - a.version ||
    a.priority - b.priority
  );
  for (const rule of ordered) {
    if (!selected.has(rule.ruleCode)) selected.set(rule.ruleCode, rule);
  }
  return [...selected.values()].sort((a, b) => a.priority - b.priority || a.ruleCode.localeCompare(b.ruleCode));
}
