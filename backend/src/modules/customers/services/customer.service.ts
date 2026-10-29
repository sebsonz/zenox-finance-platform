import { withTenantTransaction } from "../../../db/transaction.js";
import { currencyRepository } from "../../currencies/repositories/currency.repository.js";
import type { FinanceRequestContext } from "../../integration-auth/types/authenticated-principal.js";

export type FinanceCustomerReadContext = Pick<FinanceRequestContext, "tenantId" | "correlationId">;
import { customerRepository, type FinanceCustomer } from "../repositories/customer.repository.js";
import type { CreateCustomerInput, ListCustomersQuery, UpdateCustomerInput } from "../validators/customer.schema.js";

export class CustomerServiceError extends Error {
  constructor(
    readonly code: "CURRENCY_NOT_SUPPORTED" | "CUSTOMER_CODE_CONFLICT" | "EXTERNAL_IDENTITY_CONFLICT" | "CUSTOMER_NOT_FOUND" | "CUSTOMER_ARCHIVED",
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

  async update(context: FinanceRequestContext, customerId: string, input: UpdateCustomerInput): Promise<FinanceCustomer> {
    if (input.defaultCurrency) {
      const currency = await currencyRepository.findActiveByCode(input.defaultCurrency);
      if (!currency) throw new CustomerServiceError("CURRENCY_NOT_SUPPORTED", "The requested default currency is not active.");
    }
    return withTenantTransaction(context.tenantId, async (client) => {
      const current = await customerRepository.findById(client, customerId);
      if (!current) throw new CustomerServiceError("CUSTOMER_NOT_FOUND", "The customer was not found.");
      if (current.status !== "ACTIVE") throw new CustomerServiceError("CUSTOMER_ARCHIVED", "Archived customers cannot be modified.");
      const updated = await customerRepository.update(client, customerId, input);
      if (!updated) throw new CustomerServiceError("CUSTOMER_NOT_FOUND", "The customer was not found.");
      return updated;
    });
  },

  async archive(context: FinanceRequestContext, customerId: string): Promise<FinanceCustomer> {
    return withTenantTransaction(context.tenantId, async (client) => {
      const current = await customerRepository.findById(client, customerId);
      if (!current) throw new CustomerServiceError("CUSTOMER_NOT_FOUND", "The customer was not found.");
      if (current.status === "ARCHIVED") return current;
      const archived = await customerRepository.archive(client, customerId);
      if (!archived) throw new CustomerServiceError("CUSTOMER_NOT_FOUND", "The customer was not found.");
      return archived;
    });
  },

  async list(context: FinanceCustomerReadContext, query: ListCustomersQuery): Promise<FinanceCustomer[]> {
    return withTenantTransaction(context.tenantId, async (client) => customerRepository.list(client, query));
  },

  async findById(context: FinanceCustomerReadContext, customerId: string): Promise<FinanceCustomer | null> {
    return withTenantTransaction(context.tenantId, async (client) => customerRepository.findById(client, customerId));
  },
};
