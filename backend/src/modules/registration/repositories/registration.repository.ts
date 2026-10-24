import { pool } from "../../../db/pool.js";

export interface RegistrationRequestRecord {
  request_id: string;
  tenant_id: string;
  legal_name: string;
  country_code: string;
  default_currency: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  submitted_at: Date;
  updated_at: Date;
  rejection_reason: string | null;
}

export interface SubmittedRegistrationRecord {
  request_id: string;
  tenant_id: string;
  status: "PENDING";
  submitted_at: Date;
}

export interface SubmitRegistrationInput {
  identityIssuer: string;
  identitySubject: string;
  legalName: string;
  countryCode: string;
  defaultCurrency: string;
  acceptedTermsVersion: string;
  correlationId: string;
}

export const registrationRepository = {
  async submit(input: SubmitRegistrationInput): Promise<SubmittedRegistrationRecord> {
    const result = await pool.query<SubmittedRegistrationRecord>(
      `SELECT request_id, tenant_id, status, submitted_at
         FROM public.finance_submit_organization_registration($1, $2, $3, $4, $5, $6, $7)`,
      [
        input.identityIssuer,
        input.identitySubject,
        input.legalName,
        input.countryCode,
        input.defaultCurrency,
        input.acceptedTermsVersion,
        input.correlationId,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("REGISTRATION_SUBMISSION_FAILED");
    return row;
  },

  async listMine(identityIssuer: string, identitySubject: string): Promise<RegistrationRequestRecord[]> {
    const result = await pool.query<RegistrationRequestRecord>(
      `SELECT request_id, tenant_id, legal_name, country_code, default_currency,
              status, submitted_at, updated_at, rejection_reason
         FROM public.finance_list_my_registration_requests($1, $2)`,
      [identityIssuer, identitySubject],
    );
    return result.rows;
  },

  async findMine(
    identityIssuer: string,
    identitySubject: string,
    requestId: string,
  ): Promise<RegistrationRequestRecord | null> {
    const result = await pool.query<RegistrationRequestRecord>(
      `SELECT request_id, tenant_id, legal_name, country_code, default_currency,
              status, submitted_at, updated_at, rejection_reason
         FROM public.finance_get_my_registration_request($1, $2, $3)`,
      [identityIssuer, identitySubject, requestId],
    );
    return result.rows[0] ?? null;
  },
};
