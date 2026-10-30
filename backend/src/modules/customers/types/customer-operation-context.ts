import type { FinanceRequestContext } from "../../integration-auth/types/authenticated-principal.js";

/** Trusted read context for tenant-scoped customer queries. */
export type FinanceCustomerReadContext = Pick<FinanceRequestContext, "tenantId" | "correlationId">;

/** Human actor context mirrors the invoice domain attribution contract. */
export interface FinanceUserCustomerContext {
  readonly tenantId: string;
  readonly correlationId: string;
  readonly actor: {
    readonly type: "USER";
    readonly ref: string;
    readonly membershipId: string;
    readonly identityIssuer: string;
    readonly identitySubject: string;
  };
}

export type FinanceCustomerOperationContext = FinanceRequestContext | FinanceUserCustomerContext;

export function customerActor(context: FinanceCustomerOperationContext): {
  type: "USER" | "SERVICE";
  ref: string;
} {
  if ("actor" in context) return { type: context.actor.type, ref: context.actor.ref };
  return { type: "SERVICE", ref: context.principal.id };
}

export function customerPrincipalId(context: FinanceCustomerOperationContext): string | null {
  return "actor" in context ? null : context.principal.id;
}
