import { withTenantTransaction } from "../../../db/transaction.js";
import type { FinanceRequestContext } from "../../integration-auth/types/authenticated-principal.js";
import { paymentRepository } from "../repositories/payment.repository.js";
import type { AllocatePaymentInput, CreatePaymentInput, ListPaymentsQuery, ReverseAllocationInput } from "../validators/payment.schema.js";

export class PaymentServiceError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "PaymentServiceError";
  }
}

export const paymentService = {
  async create(context: FinanceRequestContext, input: CreatePaymentInput, idempotencyKey: string) {
    // A provider payment must not be created as if an adapter/checkout had run.
    // Provider adapter initiation is a separate, explicitly configured step.
    if (input.source === "PROVIDER") {
      throw new PaymentServiceError("PROVIDER_ADAPTER_NOT_CONFIGURED", "Provider payment initiation is not enabled yet.");
    }
    try {
      return await withTenantTransaction(context.tenantId, (client) =>
        paymentRepository.createInTransaction(client, context, input, idempotencyKey));
    } catch (error) {
      if (error instanceof Error && ["CURRENCY_NOT_SUPPORTED", "IDEMPOTENCY_KEY_REUSED", "AMOUNT_PRECISION_INVALID"].includes(error.message)) {
        throw new PaymentServiceError(error.message, error.message === "CURRENCY_NOT_SUPPORTED"
          ? "The requested currency is not active."
          : error.message === "AMOUNT_PRECISION_INVALID"
            ? "The amount exceeds the currency minor-unit precision."
            : "This idempotency key was already used with a different request.");
      }
      throw error;
    }
  },

  async confirmManual(context: FinanceRequestContext, paymentId: string, idempotencyKey: string) {
    try {
      return await withTenantTransaction(context.tenantId, (client) =>
        paymentRepository.confirmManualInTransaction(client, context, paymentId, idempotencyKey));
    } catch (error) {
      if (error instanceof Error && [
        "IDEMPOTENCY_KEY_REUSED", "PAYMENT_NOT_FOUND", "PROVIDER_PAYMENT_REQUIRES_PROVIDER_CONFIRMATION", "PAYMENT_NOT_PENDING",
      ].includes(error.message)) {
        throw new PaymentServiceError(error.message, error.message);
      }
      throw error;
    }
  },

  async allocate(context: FinanceRequestContext, paymentId: string, input: AllocatePaymentInput, idempotencyKey: string) {
    try {
      return await withTenantTransaction(context.tenantId, (client) =>
        paymentRepository.allocateInTransaction(client, context, paymentId, input, idempotencyKey));
    } catch (error) {
      if (error instanceof Error && [
        "IDEMPOTENCY_KEY_REUSED", "PAYMENT_NOT_FOUND", "PAYMENT_NOT_CONFIRMED", "INVOICE_NOT_FOUND",
        "INVOICE_NOT_ISSUED", "PAYMENT_CURRENCY_MISMATCH", "INVALID_AMOUNT",
        "PAYMENT_AMOUNT_EXCEEDED", "INVOICE_BALANCE_EXCEEDED", "AMOUNT_PRECISION_INVALID",
      ].includes(error.message)) {
        throw new PaymentServiceError(error.message, error.message);
      }
      throw error;
    }
  },

  async reverseAllocation(
    context: FinanceRequestContext, paymentId: string, allocationId: string, input: ReverseAllocationInput, idempotencyKey: string,
  ) {
    try {
      return await withTenantTransaction(context.tenantId, (client) =>
        paymentRepository.reverseAllocationInTransaction(client, context, paymentId, allocationId, input, idempotencyKey));
    } catch (error) {
      if (error instanceof Error && [
        "IDEMPOTENCY_KEY_REUSED", "ALLOCATION_NOT_FOUND", "INVALID_AMOUNT", "ALLOCATION_REVERSAL_EXCEEDED",
      ].includes(error.message)) {
        throw new PaymentServiceError(error.message, error.message);
      }
      throw error;
    }
  },

  async get(context: FinanceRequestContext, paymentId: string) {
    return withTenantTransaction(context.tenantId, async (client) => {
      const payment = await paymentRepository.findById(client, context.tenantId, paymentId);
      if (!payment) throw new PaymentServiceError("PAYMENT_NOT_FOUND", "The payment was not found.");
      return payment;
    });
  },

  async list(context: FinanceRequestContext, query: ListPaymentsQuery) {
    return withTenantTransaction(context.tenantId, (client) =>
      paymentRepository.list(client, context.tenantId, query.status, query.cursor, query.limit + 1)
        .then((rows) => ({
          payments: rows.slice(0, query.limit),
          hasMore: rows.length > query.limit,
          nextCursor: rows.length > query.limit ? rows[query.limit - 1]?.id ?? null : null,
        })));
  },

  async invoiceBalance(context: FinanceRequestContext, invoiceId: string) {
    return withTenantTransaction(context.tenantId, async (client) => {
      const balance = await paymentRepository.balance(client, context.tenantId, invoiceId);
      if (!balance) throw new PaymentServiceError("INVOICE_NOT_FOUND", "The invoice was not found.");
      return balance;
    });
  },
};
