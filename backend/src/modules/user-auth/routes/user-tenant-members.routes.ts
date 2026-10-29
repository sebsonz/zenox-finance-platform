import { Router } from "express";
import { z } from "zod";
import { requireUserAuth } from "../../../middleware/require-user-auth.js";
import { userTenantMembershipRepository } from "../../tenants/repositories/user-tenant-membership.repository.js";
import { tenantMembersRepository } from "../../tenants/repositories/tenant-members.repository.js";
import { assertActiveMembershipCan } from "../../tenants/services/user-tenant-permissions.service.js";

export const userTenantMembersRouter = Router();

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
});

userTenantMembersRouter.get(
  "/tenants/:tenantId/members",
  requireUserAuth(),
  async (req, res, next) => {
    const tenantId = z.string().uuid().safeParse(req.params["tenantId"]);
    const query = querySchema.safeParse(req.query);
    if (!tenantId.success) {
      res.status(400).json({ error: { code: "INVALID_TENANT_ID", message: "A valid tenant ID is required." } });
      return;
    }
    if (!query.success) {
      res.status(400).json({ error: { code: "INVALID_PAGINATION", message: "Pagination parameters are invalid." } });
      return;
    }
    const user = req.financeUser;
    if (!user) {
      res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "A valid user access token is required." } });
      return;
    }

    try {
      const membership = await userTenantMembershipRepository.findActiveMembership(
        tenantId.data,
        user.issuer,
        user.id,
      );
      if (!membership) {
        res.status(403).json({ error: { code: "TENANT_ACCESS_DENIED", message: "The user is not an active member of this tenant." } });
        return;
      }
      try {
        assertActiveMembershipCan(membership, "members:read");
      } catch {
        res.status(403).json({ error: { code: "MEMBERS_ACCESS_DENIED", message: "The user is not authorized to view tenant members." } });
        return;
      }
      const page = await tenantMembersRepository.list(tenantId.data, query.data.limit, query.data.offset);
      res.setHeader("Cache-Control", "no-store");
      res.status(200).json({
        data: page.items.map((member) => ({
          id: member.id,
          identityIssuer: member.identity_issuer,
          identitySubject: member.identity_subject,
          role: member.role_code,
          status: member.status,
          invitedBy: member.invited_by,
          activatedAt: member.activated_at,
          createdAt: member.created_at,
          updatedAt: member.updated_at,
        })),
        pagination: { limit: page.limit, offset: page.offset, count: page.items.length },
      });
    } catch (error) {
      next(error);
    }
  },
);
