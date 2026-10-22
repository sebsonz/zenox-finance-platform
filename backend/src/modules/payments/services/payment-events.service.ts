import { withTenantTransaction } from "../../../db/transaction.js";
import type { FinanceRequestContext } from "../../integration-auth/types/authenticated-principal.js";
import { paymentEventsRepository } from "../repositories/payment-events.repository.js";

export const paymentEventsService = {
  listPaymentEvents(context: FinanceRequestContext, paymentId: string, limit: number, cursor?: string) {
    return withTenantTransaction(context.tenantId, (client) =>
      paymentEventsRepository.listPaymentEvents(client, context, paymentId, limit, cursor));
  },

  listRefundEvents(context: FinanceRequestContext, paymentId: string, refundId: string, limit: number, cursor?: string) {
    return withTenantTransaction(context.tenantId, (client) =>
      paymentEventsRepository.listRefundEvents(client, context, paymentId, refundId, limit, cursor));
  },
};
