import { withTenantTransaction } from "../../../db/transaction.js";
import type { FinancePaymentContext } from "../types/payment-operation-context.js";
import { paymentEventsRepository } from "../repositories/payment-events.repository.js";

export const paymentEventsService = {
  listPaymentEvents(context: FinancePaymentContext, paymentId: string, limit: number, cursor?: string) {
    return withTenantTransaction(context.tenantId, (client) =>
      paymentEventsRepository.listPaymentEvents(client, context, paymentId, limit, cursor));
  },

  listRefundEvents(context: FinancePaymentContext, paymentId: string, refundId: string, limit: number, cursor?: string) {
    return withTenantTransaction(context.tenantId, (client) =>
      paymentEventsRepository.listRefundEvents(client, context, paymentId, refundId, limit, cursor));
  },
};
