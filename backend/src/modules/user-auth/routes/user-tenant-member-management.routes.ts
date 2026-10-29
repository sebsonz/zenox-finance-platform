import { Router } from "express";
import { z } from "zod";
import { requireUserAuth } from "../../../middleware/require-user-auth.js";
import { userTenantMembershipRepository } from "../../tenants/repositories/user-tenant-membership.repository.js";
import { tenantMemberManagementRepository } from "../../tenants/repositories/tenant-member-management.repository.js";
import { assertActiveMembershipCan } from "../../tenants/services/user-tenant-permissions.service.js";

export const userTenantMemberManagementRouter = Router();

const roleSchema = z.enum(["OWNER", "ADMIN", "FINANCE_MANAGER", "FINANCE_OPERATOR", "VIEWER"]);
const statusSchema = z.enum(["PENDING", "ACTIVE", "SUSPENDED", "REVOKED"]);
const updateSchema = z.object({
  role: roleSchema.optional(),
  status: statusSchema.optional(),
}).strict().refine((value) => value.role !== undefined || value.status !== undefined);

userTenantMemberManagementRouter.patch(
  "/tenants/:tenantId/members/:memberId",
  requireUserAuth(),
  async (req, res, next) => {
    const tenantId = z.string().uuid().safeParse(req.params["tenantId"]);
    const memberId = z.string().uuid().safeParse(req.params["memberId"]);
    const input = updateSchema.safeParse(req.body);
    if (!tenantId.success || !memberId.success) {
      res.status(400).json({ error: { code: "INVALID_IDENTIFIER", message: "Valid tenant and member IDs are required." } });
      return;
    }
    if (!input.success) {
      res.status(400).json({ error: { code: "INVALID_MEMBER_UPDATE", message: "Provide a valid role or status." } });
      return;
    }
    const user = req.financeUser;
    if (!user) {
      res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "A valid user access token is required." } });
      return;
    }

    try {
      const actor = await userTenantMembershipRepository.findActiveMembership(tenantId.data, user.issuer, user.id);
      if (!actor) {
        res.status(403).json({ error: { code: "TENANT_ACCESS_DENIED", message: "The user is not an active member of this tenant." } });
        return;
      }
      try {
        assertActiveMembershipCan(actor, "members:manage");
      } catch {
        res.status(403).json({ error: { code: "MEMBERS_MANAGE_DENIED", message: "The user cannot manage tenant members." } });
        return;
      }

      const result = await tenantMemberManagementRepository.update(tenantId.data, memberId.data, {
        ...(input.data.role ? { roleCode: input.data.role } : {}),
        ...(input.data.status ? { status: input.data.status } : {}),
      });
      if (result.kind === "not_found") {
        res.status(404).json({ error: { code: "MEMBER_NOT_FOUND", message: "The tenant member was not found." } });
        return;
      }
      if (result.kind === "last_owner") {
        res.status(409).json({ error: { code: "LAST_ACTIVE_OWNER", message: "A tenant must retain at least one active owner." } });
        return;
      }
      res.setHeader("Cache-Control", "no-store");
      res.status(200).json({ data: {
        id: result.member.id,
        role: result.member.role_code,
        status: result.member.status,
        activatedAt: result.member.activated_at,
      } });
    } catch (error) {
      next(error);
    }
  },
);
