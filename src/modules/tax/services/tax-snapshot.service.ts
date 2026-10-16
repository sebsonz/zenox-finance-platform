import { withTenantTransaction } from "../../../db/transaction.js";
import { currencyRepository } from "../../currencies/repositories/currency.repository.js";
import type { FinanceRequestContext } from "../../integration-auth/types/authenticated-principal.js";
import { taxSnapshotRepository, type TaxCalculationSnapshot } from "../repositories/tax-snapshot.repository.js";
import { createTaxSnapshotSchema, type CreateTaxSnapshotInput } from "../validators/tax-snapshot.schema.js";

export class TaxSnapshotServiceError extends Error {
  constructor(
    readonly code: "CURRENCY_NOT_SUPPORTED" | "SNAPSHOT_ALREADY_EXISTS",
    message: string,
  ) {
    super(message);
    this.name = "TaxSnapshotServiceError";
  }
}

function mapDatabaseError(error: unknown): never {
  if (typeof error === "object" && error !== null && "code" in error) {
    const pgCode = String((error as { code: unknown }).code);
    const constraint = "constraint" in error ? String((error as { constraint?: unknown }).constraint ?? "") : "";
    if (pgCode === "23505" && constraint.includes("document_version")) {
      throw new TaxSnapshotServiceError(
        "SNAPSHOT_ALREADY_EXISTS",
        "A tax snapshot already exists for this document version.",
      );
    }
  }
  throw error;
}

export const taxSnapshotService = {
  async create(
    context: FinanceRequestContext,
    rawInput: CreateTaxSnapshotInput,
  ): Promise<TaxCalculationSnapshot> {
    const input = createTaxSnapshotSchema.parse(rawInput);
    const currency = await currencyRepository.findActiveByCode(input.currencyCode);
    if (!currency) {
      throw new TaxSnapshotServiceError("CURRENCY_NOT_SUPPORTED", "The requested currency is not active.");
    }

    try {
      return await withTenantTransaction(context.tenantId, async (client) =>
        taxSnapshotRepository.create(client, context.tenantId, context.principal.id, currency.minorUnit, input));
    } catch (error) {
      return mapDatabaseError(error);
    }
  },

  async findByDocumentVersion(
    context: FinanceRequestContext,
    documentType: CreateTaxSnapshotInput["documentType"],
    documentId: string,
    documentVersion: number,
  ): Promise<TaxCalculationSnapshot | null> {
    return withTenantTransaction(context.tenantId, async (client) =>
      taxSnapshotRepository.findByDocumentVersion(client, documentType, documentId, documentVersion));
  },
};
