import type { FinanceRequestContext } from "../../integration-auth/types/authenticated-principal.js";
import type { FinanceUserInvoiceContext } from "../../invoices/types/invoice-operation-context.js";
export type FinancePaymentContext = FinanceRequestContext | FinanceUserInvoiceContext;
export function paymentActor(context:FinancePaymentContext):{type:"USER"|"SERVICE";ref:string}{
 return "actor" in context?{type:"USER",ref:context.actor.ref}:{type:"SERVICE",ref:context.principal.id};
}
