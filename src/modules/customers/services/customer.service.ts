import { withTenantTransaction } from "../../../db/transaction.js";
import { currencyRepository } from "../../currencies/repositories/currency.repository.js";
import type { FinanceRequestContext } from "../../integration-auth/types/authenticated-principal.js";
import { customerRepository, type FinanceCustomer } from "../repositories/customer.repository.js";
import type { CreateCustomerInput, ListCustomersQuery } from "../validators/customer.schema.js";

export class CustomerServiceError extends Error {
  constructor(
    readonly code: "CURRENCY_NOT_SUPPORTED" | "CUSTOMER_CODE_CONFLICT" | "EXTERNAL_IDENTITY_CONFLICT",
    message: string,
  ) {
    super(message);
    this.name = "CustomerServiceError";
  }
}

function mapDatabaseError(error: unknown): never {
  if (typeof error === "object" && error !== null && "code" in error) {
    const pgCode = String((error as { code: unknown }).code);
    const constraint = "constraint" in error ? String((error as { constraint?: unknown }).constraint ?? "") : "";
    if (pgCode === "23505" && constraint.includes("customer_code")) {
      throw new CustomerServiceError("CUSTOMER_CODE_CONFLICT", "A customer with this code already exists.");
    }
    if (pgCode === "23505" && constraint.includes("external_identity")) {
      throw new CustomerServiceError("EXTERNAL_IDENTITY_CONFLICT", "This external customer identity is already registered.");
    }
  }
  throw error;
}

export const customerService = {
  async create(context: FinanceRequestContext, input: CreateCustomerInput): Promise<FinanceCustomer> {
    if (input.defaultCurrency) {
      const currency = await currencyRepository.findActiveByCode(input.defaultCurrency);
      if (!currency) {
        throw new CustomerServiceError("CURRENCY_NOT_SUPPORTED", "The requested default currency is not active.");
      }
    }

    try {
      return await withTenantTransaction(context.tenantId, async (client) => {
        return customerRepository.create(client, context.tenantId, context.principal.id, input);
      });
    } catch (error) {
      return mapDatabaseError(error);
    }
  },

  async list(context: FinanceRequestContext, query: ListCustomersQuery): Promise<FinanceCustomer[]> {
    return withTenantTransaction(context.tenantId, async (client) => customerRepository.list(client, query));
  },

  async findById(context: FinanceRequestContext, customerId: string): Promise<FinanceCustomer | null> {
    return withTenantTransaction(context.tenantId, async (client) => customerRepository.findById(client, customerId));
  },
};
