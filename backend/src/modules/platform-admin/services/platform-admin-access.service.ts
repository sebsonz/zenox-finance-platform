import { platformOperatorRepository } from "../repositories/platform-operator.repository.js";

export interface PlatformIdentity {
  readonly id: string;
  readonly issuer: string;
  readonly emailConfirmedAt?: string | null;
}
export class PlatformAdminAccessError extends Error {
  constructor(readonly status: 401 | 403, readonly code: string, message: string) {
    super(message);
    this.name = "PlatformAdminAccessError";
  }
}
export const platformAdminAccessService = {
  async assertActiveOperator(identity: PlatformIdentity | undefined): Promise<void> {
    if (!identity) throw new PlatformAdminAccessError(401, "UNAUTHENTICATED", "Une session utilisateur valide est requise.");
    if (!identity.emailConfirmedAt) throw new PlatformAdminAccessError(403, "EMAIL_CONFIRMATION_REQUIRED", "Confirmez votre adresse e-mail.");
    if (!(await platformOperatorRepository.isActive(identity.issuer, identity.id))) {
      throw new PlatformAdminAccessError(403, "PLATFORM_OPERATOR_REQUIRED", "Une autorisation d’administration de la plateforme est requise.");
    }
  },
};
