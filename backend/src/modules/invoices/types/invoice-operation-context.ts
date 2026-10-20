import type { FinanceRequestContext } from "../../integration-auth/types/authenticated-principal.js";

/**
 * The invoice domain accepts either a verified service principal or a verified
 * human user. The actor discriminator is never inferred from request payloads.
 */
export interface FinanceUserInvoiceContext {
  readonly tenantId: string;
  readonly correlationId: string;
  readonly actor: {
    readonly type: "USER";
    /** Stable, non-secret identity: issuer + subject + membership ID. */
    readonly ref: string;
    readonly membershipId: string;
    readonly identityIssuer: string;
    readonly identitySubject: string;
  };
}

export type FinanceInvoiceOperationContext = FinanceRequestContext | FinanceUserInvoiceContext;

export function invoiceActor(context: FinanceInvoiceOperationContext): {
  type: "USER" | "SERVICE";
  ref: string;
} {
  if ("actor" in context) return { type: context.actor.type, ref: context.actor.ref };
  return { type: "SERVICE", ref: context.principal.id };
}

export function isUserInvoiceContext(
  context: FinanceInvoiceOperationContext,
): context is FinanceUserInvoiceContext {
  return "actor" in context;
}
