import { pool } from "../../../db/pool.js";

export interface PlatformUserDirectoryRow {
  identity_subject: string;
  email: string | null;
  email_confirmed_at: Date | null;
  created_at: Date;
  last_sign_in_at: Date | null;
  account_status: "ACTIVE" | "SUSPENDED" | "DELETED";
  organizations: Array<{ tenantId: string; tenantCode: string; legalName: string; role: string; status: string }>;
  platform_operator_status: "ACTIVE" | "SUSPENDED" | null;
}
export interface PlatformUserDirectoryPage {
  items: PlatformUserDirectoryRow[];
  total: number;
  page: number;
  pageSize: number;
}
export const platformUserDirectoryRepository = {
  async list(input: { operatorIssuer: string; operatorSubject: string; page: number; pageSize: number; query: string; status: string }): Promise<PlatformUserDirectoryPage> {
    const result = await pool.query<PlatformUserDirectoryPage>(
      "SELECT public.finance_list_platform_user_directory($1, $2, $3, $4, $5, $6) AS result",
      [input.operatorIssuer, input.operatorSubject, input.page, input.pageSize, input.query || null, input.status === "ALL" ? null : input.status],
    );
    const value = result.rows[0]?.result;
    if (!value) return { items: [], total: 0, page: input.page, pageSize: input.pageSize };
    return {
      items: Array.isArray(value.items) ? value.items : [],
      total: Number(value.total ?? 0),
      page: Number(value.page ?? input.page),
      pageSize: Number(value.pageSize ?? input.pageSize),
    };
  },
};
