import type { RegistrationStatus } from "./registration.types.js";

const allowedTransitions: Record<RegistrationStatus, readonly RegistrationStatus[]> = {
  DRAFT: ["PENDING"],
  PENDING: ["APPROVED", "REJECTED"],
  APPROVED: [],
  REJECTED: [],
};

export function canTransitionRegistration(current: RegistrationStatus, next: RegistrationStatus): boolean {
  return allowedTransitions[current].includes(next);
}

export function assertRegistrationTransition(current: RegistrationStatus, next: RegistrationStatus): void {
  if (!canTransitionRegistration(current, next)) {
    throw new Error("INVALID_REGISTRATION_STATUS_TRANSITION");
  }
}
