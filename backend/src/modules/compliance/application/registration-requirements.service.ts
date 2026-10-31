import { pool } from "../../../db/pool.js";

export interface RegistrationRequirement {
  requirement_id: string;
  requirement_code: string;
  version: number;
  title: string;
  description: string;
  is_required: boolean;
  accepted_document_types: string[];
  source_authority: string;
  source_reference: string;
  source_url: string | null;
  valid_from: string;
  valid_to: string | null;
}

export const registrationRequirementsService = {
  async list(jurisdictionCode: string, legalForm: string | null) {
    const result = await pool.query<RegistrationRequirement>(
      `SELECT * FROM public.finance_list_registration_requirements($1,$2,'ORGANIZATION',CURRENT_DATE)`,
      [jurisdictionCode, legalForm],
    );
    return {
      jurisdictionCode,
      configurationStatus: result.rows.length ? "APPROVED_REQUIREMENTS_AVAILABLE" as const : "NO_APPROVED_CONFIGURATION" as const,
      requirements: result.rows,
    };
  },
};
