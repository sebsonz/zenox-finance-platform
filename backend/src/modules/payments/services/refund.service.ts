import { withTenantTransaction } from "../../../db/transaction.js";
import type { FinanceRequestContext } from "../../integration-auth/types/authenticated-principal.js";
import { refundRepository } from "../repositories/refund.repository.js";
import type { CreateRefundInput, RecordManualRefundSuccessInput } from "../validators/refund.schema.js";

export class RefundServiceError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "RefundServiceError";
  }
}

const handledCodes = new Set([
  "IDEMPOTENCY_KEY_REUSED","PAYMENT_NOT_FOUND","PAYMENT_NOT_CONFIRMED","CURRENCY_NOT_SUPPORTED",
  "AMOUNT_PRECISION_INVALID","REFUND_AMOUNT_EXCEEDED","REFUND_NOT_FOUND","REFUND_NOT_REQUESTED",
  "REFUND_NOT_APPROVED","REFUND_NOT_CANCELLABLE","PROVIDER_REFUND_REQUIRES_PROVIDER_ADAPTER",
]);

async function translate<T>(work: () => Promise<T>): Promise<T> {
  try { return await work(); }
  catch (error) {
    if (error instanceof Error && handledCodes.has(error.message)) {
      throw new RefundServiceError(error.message,error.message);
    }
    throw error;
  }
}

export const refundService = {
  request(context: FinanceRequestContext,paymentId: string,input: CreateRefundInput,key: string) {
    return translate(() => withTenantTransaction(context.tenantId,client =>
      refundRepository.request(client,context,paymentId,input,key)));
  },
  approve(context: FinanceRequestContext,paymentId: string,refundId: string,key: string) {
    return translate(() => withTenantTransaction(context.tenantId,client =>
      refundRepository.approve(client,context,paymentId,refundId,key)));
  },
  recordManualSuccess(
    context: FinanceRequestContext,paymentId: string,refundId: string,input: RecordManualRefundSuccessInput,key: string,
  ) {
    return translate(() => withTenantTransaction(context.tenantId,client =>
      refundRepository.recordManualSuccess(client,context,paymentId,refundId,input,key)));
  },
  cancel(context: FinanceRequestContext,paymentId: string,refundId: string,key: string) {
    return translate(() => withTenantTransaction(context.tenantId,client =>
      refundRepository.cancel(client,context,paymentId,refundId,key)));
  },
};
