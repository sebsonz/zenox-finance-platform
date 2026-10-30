import { platformOperatorRepository } from "../repositories/platform-operator.repository.js";

export interface VerifiedPlatformIdentity {
  readonly id: string;
  readonly issuer: string;
  readonly emailConfirmedAt?: string | null;
}

export class PlatformAdminAccessError extends Error {
  constructor(
    readonly code: "UNAUTHENTICATED" | "EMAIL_CONFIRMATION_REQUIRED" | "PLATFORM_OPERATOR_REQUIRED",
    readonly status: 401 | 403,
    message: string,
  ) {
    super(message);
    this.name = "PlatformAdminAccessError";
  }
}

/**
 * Shared application boundary for platform-only operations.
 * Callers must pass the identity populated by requireUserAuth, never request data.
 */
export const platformAdminAccessService = {
  async assertActiveOperator(identity: VerifiedPlatformIdentity | undefined): Promise<void> {
    if (!identity) {
      throw new PlatformAdminAccessError(
        "UNAUTHENTICATED",
        401,
        "A valid user session is required.",
      );
    }
    if (!identity.emailConfirmedAt) {
      throw new PlatformAdminAccessError(
        "EMAIL_CONFIRMATION_REQUIRED",
        403,
        "Confirmez votre adresse e-mail.",
      );
    }
    const active = await platformOperatorRepository.isActive(identity.issuer, identity.id);
    if (!active) {
      throw new PlatformAdminAccessError(
        "PLATFORM_OPERATOR_REQUIRED",
        403,
        "Une autorisation d’administration de la plateforme est requise.",
      );
    }
  },
};
