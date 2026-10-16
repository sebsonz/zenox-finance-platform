import { withTenantTransaction } from "../../../db/transaction.js";
import { currencyRepository } from "../../currencies/repositories/currency.repository.js";
import type { FinanceRequestContext } from "../../integration-auth/types/authenticated-principal.js";
import { calculateTaxStack } from "../engine/tax-stack.engine.js";
import { taxRuleRepository } from "../repositories/tax-rule.repository.js";
import { taxSnapshotRepository, type TaxCalculationSnapshot } from "../repositories/tax-snapshot.repository.js";
import { calculateAndSnapshotTaxSchema, type CalculateAndSnapshotTaxInput } from "../validators/tax-calculation-request.schema.js";
import { createTaxSnapshotSchema } from "../validators/tax-snapshot.schema.js";

export class TaxCalculationServiceError extends Error {
  constructor(
    readonly code: "CURRENCY_NOT_SUPPORTED" | "NO_ACTIVE_TAX_RULES" | "INCOMPATIBLE_TAX_PRICE_MODES" | "SNAPSHOT_ALREADY_EXISTS",
    message: string,
  ) {
    super(message);
    this.name = "TaxCalculationServiceError";
  }
}

function mapDatabaseError(error: unknown): never {
  if (typeof error === "object" && error !== null && "code" in error) {
    const pgCode = String((error as { code: unknown }).code);
    const constraint = "constraint" in error ? String((error as { constraint?: unknown }).constraint ?? "") : "";
    if (pgCode === "23505" && constraint.includes("document_version")) {
      throw new TaxCalculationServiceError(
        "SNAPSHOT_ALREADY_EXISTS",
        "A tax snapshot already exists for this document version. Create a new document version to recalculate.",
      );
    }
  }
  throw error;
}

/**
 * Finance-owned calculation boundary: callers supply business facts only.
 * Rules, tax results, policy, engine version and applied-rule evidence are generated here.
 */
export const taxCalculationService = {
  async calculateAndSnapshot(
    context: FinanceRequestContext,
    rawInput: CalculateAndSnapshotTaxInput,
  ): Promise<TaxCalculationSnapshot> {
    const input = calculateAndSnapshotTaxSchema.parse(rawInput);
    const currency = await currencyRepository.findActiveByCode(input.currencyCode);
    if (!currency) {
      throw new TaxCalculationServiceError("CURRENCY_NOT_SUPPORTED", "The requested currency is not active.");
    }

    try {
      return await withTenantTransaction(context.tenantId, async (client) => {
        const rules = await taxRuleRepository.listEffectiveForJurisdiction(
          client,
          input.jurisdictionId,
          input.appliesTo,
          input.taxDate,
        );
        if (rules.length === 0) {
          throw new TaxCalculationServiceError(
            "NO_ACTIVE_TAX_RULES",
            "No active, effective tax rules exist for this jurisdiction and category; calculation was refused.",
          );
        }
        if (rules.length > 50) throw new Error("TOO_MANY_TAX_COMPONENTS");

        const priceModes = new Set(rules.map((rule) => rule.priceMode));
        if (priceModes.size !== 1) {
          throw new TaxCalculationServiceError(
            "INCOMPATIBLE_TAX_PRICE_MODES",
            "Applicable rules mix inclusive and exclusive prices; calculation was refused.",
          );
        }
        const priceMode = rules[0]?.priceMode;
        if (!priceMode) throw new Error("NO_ACTIVE_TAX_RULES");

        const result = calculateTaxStack({
          amount: input.amount,
          priceMode,
          currency: currency.code,
          currencyDecimalPlaces: currency.minorUnit,
          taxes: rules.map((rule) => ({
            ruleCode: rule.ruleCode,
            treatment: rule.treatment,
            ratePercent: rule.ratePercent,
            isCompound: rule.isCompound,
          })),
        });

        const snapshotInput = {
          documentType: input.documentType,
          documentId: input.documentId,
          documentVersion: input.documentVersion,
          calculationPolicy: result.calculationPolicy,
          engineVersion: "zenox-finance-tax-engine/1.0.0",
          taxDate: input.taxDate,
          currencyCode: currency.code,
          jurisdictionId: input.jurisdictionId,
          inputSnapshot: {
            amount: input.amount,
            appliesTo: input.appliesTo,
            priceMode,
            currencyCode: currency.code,
            currencyMinorUnit: currency.minorUnit,
            jurisdictionId: input.jurisdictionId,
            taxDate: input.taxDate,
          },
          resultSnapshot: result as unknown as Record<string, unknown>,
          appliedRulesSnapshot: rules.map((rule) => ({
            id: rule.id,
            tenantId: rule.tenantId,
            jurisdictionId: rule.jurisdictionId,
            ruleCode: rule.ruleCode,
            name: rule.name,
            taxType: rule.taxType,
            treatment: rule.treatment,
            ratePercent: rule.ratePercent,
            priceMode: rule.priceMode,
            priority: rule.priority,
            isCompound: rule.isCompound,
            appliesTo: rule.appliesTo,
            sourceReference: rule.sourceReference,
            sourceUrl: rule.sourceUrl,
            version: rule.version,
            validFrom: rule.validFrom,
            validTo: rule.validTo,
          })),
        };
        const validatedSnapshot = createTaxSnapshotSchema.parse(snapshotInput);
        return taxSnapshotRepository.create(
          client,
          context.tenantId,
          context.principal.id,
          currency.minorUnit,
          validatedSnapshot,
        );
      });
    } catch (error) {
      return mapDatabaseError(error);
    }
  },
};
