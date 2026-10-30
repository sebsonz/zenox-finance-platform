/**
 * Trusted human context for tenant-profile operations.
 *
 * Construct this only at an authenticated HTTP boundary after resolving an
 * active membership, checking the requested permission, and confirming that
 * the tenant is active. Never build it from request-body fields.
 */
export interface FinanceUserTenantContext {
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
