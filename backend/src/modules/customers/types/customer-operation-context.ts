import type { FinanceRequestContext } from "../../integration-auth/types/authenticated-principal.js";

/** Minimal trusted tenant context for read-only customer use cases. */
export type FinanceCustomerReadContext = Pick<FinanceRequestContext, "tenantId" | "correlationId">;
