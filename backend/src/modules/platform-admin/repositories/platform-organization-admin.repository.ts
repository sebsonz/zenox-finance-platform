import { pool } from "../../../db/pool.js";

export type PlatformOrganizationMemberRole = "OWNER" | "ADMIN" | "FINANCE_MANAGER" | "FINANCE_OPERATOR" | "VIEWER";
export type PlatformOrganizationMemberStatus = "PENDING" | "ACTIVE" | "SUSPENDED" | "REVOKED";

export interface PlatformOrganizationProfileInput {
  tradeName: string | null;
  timezone: string;
  primaryLanguage: string;
  supportedLanguages: string[];
  websiteUrl: string | null;
  generalEmail: string | null;
  generalPhone: string | null;
}

export const platformOrganizationAdminRepository = {
  async getDetails(operatorIssuer: string, operatorSubject: string, tenantId: string): Promise<Record<string, unknown> | null> {
    const result = await pool.query<{ dossier: Record<string, unknown> | null }>(
      "SELECT public.finance_get_platform_organization_details($1, $2, $3) AS dossier",
      [operatorIssuer, operatorSubject, tenantId],
    );
    return result.rows[0]?.dossier ?? null;
  },

  async updateProfile(input: {
    operatorIssuer: string; operatorSubject: string; tenantId: string;
    profile: PlatformOrganizationProfileInput; reason: string; correlationId: string;
  }): Promise<{ tenant_id: string; updated_at: Date }> {
    const result = await pool.query<{ tenant_id: string; updated_at: Date }>(
      \`SELECT tenant_id, updated_at
         FROM public.finance_platform_update_organization_profile($1, $2, $3, $4::jsonb, $5, $6)\`,
      [input.operatorIssuer, input.operatorSubject, input.tenantId, JSON.stringify(input.profile), input.reason, input.correlationId],
    );
    const row = result.rows[0];
    if (!row) throw new Error("ORGANIZATION_PROFILE_UPDATE_FAILED");
    return row;
  },

  async updateMember(input: {
    operatorIssuer: string; operatorSubject: string; tenantId: string; memberId: string;
    role: PlatformOrganizationMemberRole; status: PlatformOrganizationMemberStatus;
    reason: string; correlationId: string;
  }): Promise<{ member_id: string; role_code: string; status: string; updated_at: Date }> {
    const result = await pool.query<{ member_id: string; role_code: string; status: string; updated_at: Date }>(
      \`SELECT member_id, role_code, status, updated_at
         FROM public.finance_platform_update_organization_member($1, $2, $3, $4, $5, $6, $7, $8)\`,
      [input.operatorIssuer, input.operatorSubject, input.tenantId, input.memberId, input.role, input.status, input.reason, input.correlationId],
    );
    const row = result.rows[0];
    if (!row) throw new Error("ORGANIZATION_MEMBER_UPDATE_FAILED");
    return row;
  },
};
