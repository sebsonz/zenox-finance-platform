import { withTenantTransaction } from "../../../db/transaction.js";
import type { FinanceRequestContext } from "../../integration-auth/types/authenticated-principal.js";
import { customerRepository } from "../repositories/customer.repository.js";
import { customerRelationsRepository } from "../repositories/customer-relations.repository.js";
import type {
  CreateCustomerAddressInput,
  CreateCustomerContactInput,
  UpdateCustomerAddressInput,
  UpdateCustomerContactInput,
  ListCustomerRelationsQuery,
} from "../validators/customer-relations.schema.js";

export class CustomerRelationsServiceError extends Error {
  constructor(readonly code: "CUSTOMER_NOT_FOUND" | "CUSTOMER_ARCHIVED" | "RELATION_NOT_FOUND" | "PRIMARY_RELATION_CONFLICT", message: string) {
    super(message);
    this.name = "CustomerRelationsServiceError";
  }
}

function mapRelationError(error: unknown): never {
  if (typeof error === "object" && error !== null && "code" in error) {
    const dbCode = String((error as { code: unknown }).code);
    const constraint = "constraint" in error ? String((error as { constraint?: unknown }).constraint ?? "") : "";
    if (dbCode === "23505" && constraint.includes("one_primary_active")) {
      throw new CustomerRelationsServiceError("PRIMARY_RELATION_CONFLICT", "This customer already has a primary active record of this type.");
    }
  }
  throw error;
}

export const customerRelationsService = {
  async createContact(context: FinanceRequestContext, customerId: string, input: CreateCustomerContactInput) {
    try {
      return await withTenantTransaction(context.tenantId, async (client) => {
        const customer = await customerRepository.findById(client, customerId);
        if (!customer) throw new CustomerRelationsServiceError("CUSTOMER_NOT_FOUND", "The customer was not found.");
        if (customer.status !== "ACTIVE") throw new CustomerRelationsServiceError("CUSTOMER_ARCHIVED", "Contacts cannot be added to an archived customer.");
        return customerRelationsRepository.createContact(client, context.tenantId, customerId, input);
      });
    } catch (error) { return mapRelationError(error); }
  },

  async updateContact(context: FinanceRequestContext, customerId: string, contactId: string, input: UpdateCustomerContactInput) {
    try {
      return await withTenantTransaction(context.tenantId, async (client) => {
        const customer = await customerRepository.findById(client, customerId);
        if (!customer) throw new CustomerRelationsServiceError("CUSTOMER_NOT_FOUND", "The customer was not found.");
        if (customer.status !== "ACTIVE") throw new CustomerRelationsServiceError("CUSTOMER_ARCHIVED", "Contacts cannot be modified for an archived customer.");
        const contact = await customerRelationsRepository.updateContact(client, customerId, contactId, input);
        if (!contact) throw new CustomerRelationsServiceError("RELATION_NOT_FOUND", "The contact was not found.");
        return contact;
      });
    } catch (error) { return mapRelationError(error); }
  },

  async archiveContact(context: FinanceRequestContext, customerId: string, contactId: string) {
    return withTenantTransaction(context.tenantId, async (client) => {
      const customer = await customerRepository.findById(client, customerId);
      if (!customer) throw new CustomerRelationsServiceError("CUSTOMER_NOT_FOUND", "The customer was not found.");
      const contact = await customerRelationsRepository.archiveContact(client, customerId, contactId);
      if (!contact) throw new CustomerRelationsServiceError("RELATION_NOT_FOUND", "The contact was not found or is already archived.");
      return contact;
    });
  },

  async listContacts(context: FinanceRequestContext, customerId: string, query: ListCustomerRelationsQuery) {
    return withTenantTransaction(context.tenantId, async (client) => {
      const customer = await customerRepository.findById(client, customerId);
      if (!customer) throw new CustomerRelationsServiceError("CUSTOMER_NOT_FOUND", "The customer was not found.");
      return customerRelationsRepository.listContacts(client, customerId, query);
    });
  },

  async createAddress(context: FinanceRequestContext, customerId: string, input: CreateCustomerAddressInput) {
    try {
      return await withTenantTransaction(context.tenantId, async (client) => {
        const customer = await customerRepository.findById(client, customerId);
        if (!customer) throw new CustomerRelationsServiceError("CUSTOMER_NOT_FOUND", "The customer was not found.");
        if (customer.status !== "ACTIVE") throw new CustomerRelationsServiceError("CUSTOMER_ARCHIVED", "Addresses cannot be added to an archived customer.");
        return customerRelationsRepository.createAddress(client, context.tenantId, customerId, input);
      });
    } catch (error) { return mapRelationError(error); }
  },

  async updateAddress(context: FinanceRequestContext, customerId: string, addressId: string, input: UpdateCustomerAddressInput) {
    try {
      return await withTenantTransaction(context.tenantId, async (client) => {
        const customer = await customerRepository.findById(client, customerId);
        if (!customer) throw new CustomerRelationsServiceError("CUSTOMER_NOT_FOUND", "The customer was not found.");
        if (customer.status !== "ACTIVE") throw new CustomerRelationsServiceError("CUSTOMER_ARCHIVED", "Addresses cannot be modified for an archived customer.");
        const address = await customerRelationsRepository.updateAddress(client, customerId, addressId, input);
        if (!address) throw new CustomerRelationsServiceError("RELATION_NOT_FOUND", "The address was not found.");
        return address;
      });
    } catch (error) { return mapRelationError(error); }
  },

  async archiveAddress(context: FinanceRequestContext, customerId: string, addressId: string) {
    return withTenantTransaction(context.tenantId, async (client) => {
      const customer = await customerRepository.findById(client, customerId);
      if (!customer) throw new CustomerRelationsServiceError("CUSTOMER_NOT_FOUND", "The customer was not found.");
      const address = await customerRelationsRepository.archiveAddress(client, customerId, addressId);
      if (!address) throw new CustomerRelationsServiceError("RELATION_NOT_FOUND", "The address was not found or is already archived.");
      return address;
    });
  },

  async listAddresses(context: FinanceRequestContext, customerId: string, query: ListCustomerRelationsQuery) {
    return withTenantTransaction(context.tenantId, async (client) => {
      const customer = await customerRepository.findById(client, customerId);
      if (!customer) throw new CustomerRelationsServiceError("CUSTOMER_NOT_FOUND", "The customer was not found.");
      return customerRelationsRepository.listAddresses(client, customerId, query);
    });
  },
};
