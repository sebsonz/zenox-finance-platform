import { onboardingRepository } from "../repositories/onboarding.repository.js";
import type { RegistrationDraft, RegistrationPayload, RegistrationRequestSummary } from "../domain/registration.types.js";

export interface OnboardingUserContext {
  readonly identityIssuer: string;
  readonly identitySubject: string;
  readonly emailConfirmedAt: string | null;
  readonly correlationId: string;
}

function assertConfirmed(context: OnboardingUserContext): void {
  if (!context.emailConfirmedAt) throw new Error("EMAIL_CONFIRMATION_REQUIRED");
}

export const onboardingService = {
  async createOrSaveDraft(context: OnboardingUserContext, payload: RegistrationPayload): Promise<RegistrationDraft> {
    assertConfirmed(context);
    return onboardingRepository.saveDraft(context.identityIssuer, context.identitySubject, payload);
  },

  async updateDraft(context: OnboardingUserContext, draftId: string, payload: RegistrationPayload): Promise<RegistrationDraft> {
    assertConfirmed(context);
    return onboardingRepository.updateDraft(context.identityIssuer, context.identitySubject, draftId, payload);
  },

  async getDraft(context: OnboardingUserContext, draftId: string): Promise<RegistrationDraft | null> {
    assertConfirmed(context);
    return onboardingRepository.findDraft(context.identityIssuer, context.identitySubject, draftId);
  },

  async submitDraft(
    context: OnboardingUserContext,
    draftId: string,
    acceptedTermsVersion: string,
    acceptedPrivacyVersion: string,
  ): Promise<{ requestId: string; tenantId: string; status: string; submittedAt: string }> {
    assertConfirmed(context);
    const row = await onboardingRepository.submitDraft(
      context.identityIssuer, context.identitySubject, draftId,
      acceptedTermsVersion, acceptedPrivacyVersion, context.correlationId,
    );
    return { requestId: row.request_id, tenantId: row.tenant_id, status: row.status, submittedAt: row.submitted_at.toISOString() };
  },

  async listMine(context: OnboardingUserContext): Promise<readonly RegistrationRequestSummary[]> {
    assertConfirmed(context);
    return onboardingRepository.listMine(context.identityIssuer, context.identitySubject);
  },
};
