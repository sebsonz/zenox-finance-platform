import type {
  ResolveTenantExternalReferenceInput,
  ResolveTenantExternalReferenceResult,
} from "../domain/tenant-external-reference.types.js";

/**
 * Application boundary exported by Integrations.
 * Callers must authenticate/authorize the principal before resolving a reference.
 */
export interface TenantExternalReferencePort {
  resolveActiveReference(
    input: ResolveTenantExternalReferenceInput,
  ): Promise<ResolveTenantExternalReferenceResult | null>;
}
