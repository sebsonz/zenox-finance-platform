import { pool } from "../../../db/pool.js";
import type { RegistrationDraft, RegistrationPayload, RegistrationRequestSummary } from "../domain/registration.types.js";

interface DraftRow {
  draft_id: string;
  payload: RegistrationPayload;
  status?: "DRAFT" | "SUBMITTED";
  created_at: Date;
  updated_at: Date;
}

interface SubmittedRow {
  request_id: string;
  tenant_id: string;
  status: "PENDING";
  submitted_at: Date;
}

export const onboardingRepository = {
  async saveDraft(identityIssuer: string, identitySubject: string, payload: RegistrationPayload): Promise<RegistrationDraft> {
    const result = await pool.query<DraftRow>(
      `SELECT draft_id, payload, created_at, updated_at
         FROM public.finance_create_registration_draft($1, $2, $3::jsonb)`,
      [identityIssuer, identitySubject, JSON.stringify(payload)],
    );
    const row = result.rows[0];
    if (!row) throw new Error("REGISTRATION_DRAFT_SAVE_FAILED");
    return { id: row.draft_id, payload: row.payload, status: "DRAFT", createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString() };
  },

  async updateDraft(identityIssuer: string, identitySubject: string, draftId: string, payload: RegistrationPayload): Promise<RegistrationDraft> {
    const result = await pool.query<DraftRow>(
      `SELECT draft_id, payload, created_at, updated_at
         FROM public.finance_update_registration_draft($1, $2, $3, $4::jsonb)`,
      [identityIssuer, identitySubject, draftId, JSON.stringify(payload)],
    );
    const row = result.rows[0];
    if (!row) throw new Error("REGISTRATION_DRAFT_UPDATE_FAILED");
    return { id: row.draft_id, payload: row.payload, status: "DRAFT", createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString() };
  },

  async findDraft(identityIssuer: string, identitySubject: string, draftId: string): Promise<RegistrationDraft | null> {
    const result = await pool.query<DraftRow & { status: "DRAFT" | "SUBMITTED" }>(
      `SELECT draft_id, payload, status, created_at, updated_at
         FROM public.finance_get_my_registration_draft($1, $2, $3)`,
      [identityIssuer, identitySubject, draftId],
    );
    const row = result.rows[0];
    return row ? { id: row.draft_id, payload: row.payload, status: row.status, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString() } : null;
  },

  async submitDraft(
    identityIssuer: string,
    identitySubject: string,
    draftId: string,
    acceptedTermsVersion: string,
    acceptedPrivacyVersion: string,
    correlationId: string,
  ): Promise<SubmittedRow> {
    const result = await pool.query<SubmittedRow>(
      `SELECT request_id, tenant_id, status, submitted_at
         FROM public.finance_submit_registration_draft($1, $2, $3, $4, $5, $6)`,
      [identityIssuer, identitySubject, draftId, acceptedTermsVersion, acceptedPrivacyVersion, correlationId],
    );
    const row = result.rows[0];
    if (!row) throw new Error("REGISTRATION_DRAFT_SUBMISSION_FAILED");
    return row;
  },

  async listMine(identityIssuer: string, identitySubject: string): Promise<RegistrationRequestSummary[]> {
    const result = await pool.query<{
      request_id: string; tenant_id: string; legal_name: string; country_code: string;
      default_currency: string; status: "PENDING" | "APPROVED" | "REJECTED";
      submitted_at: Date; updated_at: Date; rejection_reason: string | null;
    }>(
      `SELECT request_id, tenant_id, legal_name, country_code, default_currency,
              status, submitted_at, updated_at, rejection_reason
         FROM public.finance_list_my_registration_requests($1, $2)`,
      [identityIssuer, identitySubject],
    );
    return result.rows.map((row) => ({
      id: row.request_id, tenantId: row.tenant_id, legalName: row.legal_name,
      countryCode: row.country_code, defaultCurrency: row.default_currency,
      status: row.status, submittedAt: row.submitted_at.toISOString(),
      updatedAt: row.updated_at.toISOString(), rejectionReason: row.rejection_reason,
    }));
  },
};
