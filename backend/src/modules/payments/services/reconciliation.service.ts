import { withTenantTransaction } from "../../../db/transaction.js";
import type { FinanceRequestContext } from "../../integration-auth/types/authenticated-principal.js";
import { reconciliationRepository } from "../repositories/reconciliation.repository.js";
import type {
  ReconciliationImportInput,
  ReconciliationListQuery,
  ReconciliationMatchInput,
} from "../validators/reconciliation.schema.js";

export class ReconciliationServiceError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "ReconciliationServiceError";
  }
}

const handledCodes = new Set([
  "RECONCILIATION_ITEM_NOT_FOUND",
  "RECONCILIATION_ITEM_IGNORED",
  "RECONCILIATION_ALREADY_MATCHED",
  "RECONCILIATION_PAYMENT_NOT_FOUND",
]);

async function translate<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof Error && handledCodes.has(error.message)) {
      throw new ReconciliationServiceError(error.message, error.message);
    }
    throw error;
  }
}

export const reconciliationService = {
  import(context: FinanceRequestContext, input: ReconciliationImportInput) {
    return translate(() => withTenantTransaction(context.tenantId, (client) =>
      reconciliationRepository.importRows(client, context, input)));
  },

  list(context: FinanceRequestContext, query: ReconciliationListQuery) {
    return translate(() => withTenantTransaction(context.tenantId, (client) =>
      reconciliationRepository.list(client, context, query)));
  },

  match(context: FinanceRequestContext, itemId: string, input: ReconciliationMatchInput) {
    return translate(() => withTenantTransaction(context.tenantId, (client) =>
      reconciliationRepository.match(client, context, itemId, input)));
  },
};
