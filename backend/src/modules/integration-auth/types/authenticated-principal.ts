export interface AuthenticatedIntegrationPrincipal {
  readonly id: string;
  readonly principalCode: string;
  readonly displayName: string;
  readonly scopes: readonly string[];
  readonly allowedTenantIds: readonly string[];
}

export interface FinanceRequestContext {
  readonly principal: AuthenticatedIntegrationPrincipal;
  readonly tenantId: string;
  readonly correlationId: string;
}
