import { Router } from "express";
import { z } from "zod";
import { requireUserAuth } from "../../../middleware/require-user-auth.js";
import { userTenantMembershipRepository } from "../../tenants/repositories/user-tenant-membership.repository.js";
import { assertActiveMembershipCan } from "../../tenants/services/user-tenant-permissions.service.js";
import { tenantRepository } from "../../tenants/repositories/tenant.repository.js";

export const userTenantAccessRouter = Router();

const tenantIdSchema = z.string().uuid();

userTenantAccessRouter.get(
  "/tenants/:tenantId",
  requireUserAuth(),
  async (req, res, next) => {
    const parsedTenantId = tenantIdSchema.safeParse(req.params["tenantId"]);
    if (!parsedTenantId.success) {
      res.status(400).json({
        error: { code: "INVALID_TENANT_ID", message: "A valid tenant ID is required." },
      });
      return;
    }

    const user = req.financeUser;
    if (!user) {
      res.status(401).json({
        error: { code: "UNAUTHENTICATED", message: "A valid user access token is required." },
      });
      return;
    }

    try {
      const membership = await userTenantMembershipRepository.findActiveMembership(
        parsedTenantId.data,
        user.issuer,
        user.id,
      );

      if (!membership) {
        res.status(403).json({
          error: { code: "TENANT_ACCESS_DENIED", message: "The user is not an active member of this tenant." },
        });
        return;
      }

      try {
        assertActiveMembershipCan(membership, "tenant:read");
      } catch {
        res.status(403).json({
          error: { code: "TENANT_ACCESS_DENIED", message: "The user is not authorized to view this tenant." },
        });
        return;
      }

      const tenant = await tenantRepository.findActiveById(parsedTenantId.data);
      if (!tenant) {
        res.status(404).json({
          error: { code: "TENANT_NOT_AVAILABLE", message: "The requested tenant is not available." },
        });
        return;
      }

      res.status(200).json({
        data: {
          id: tenant.id,
          tenantCode: tenant.tenant_code,
          legalName: tenant.legal_name,
          role: membership.role_code,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);
