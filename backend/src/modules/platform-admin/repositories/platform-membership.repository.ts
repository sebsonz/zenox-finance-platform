import { pool } from "../../../db/pool.js";

export const platformMembershipRepository = {
  async canManage(actorIssuer: string, actorSubject: string): Promise<boolean> {
    const result = await pool.query<{ allowed: boolean }>(
      "SELECT public.finance_platform_actor_can($1, $2, 'PLATFORM_MEMBERS_MANAGE') AS allowed",
      [actorIssuer, actorSubject],
    );
    return result.rows[0]?.allowed === true;
  },

  async list(actorIssuer: string, actorSubject: string) {
    const result = await pool.query(
      "SELECT * FROM public.finance_list_platform_members($1, $2)",
      [actorIssuer, actorSubject],
    );
    return result.rows;
  },

  async set(input: {
    actorIssuer: string;
    actorSubject: string;
    targetIssuer: string;
    targetSubject: string;
    roleCode: string;
    status: string;
    reason: string;
    correlationId: string;
  }): Promise<void> {
    await pool.query(
      "SELECT public.finance_set_platform_member($1,$2,$3,$4,$5,$6,$7,$8)",
      [input.actorIssuer,input.actorSubject,input.targetIssuer,input.targetSubject,
       input.roleCode,input.status,input.reason,input.correlationId],
    );
  },
};
