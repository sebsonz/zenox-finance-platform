import { Router } from "express";
import { requireUserAuth } from "../../../middleware/require-user-auth.js";
import { userTenantDirectoryRepository } from "../../tenants/repositories/user-tenant-directory.repository.js";

export const userTenantDirectoryRouter = Router();

userTenantDirectoryRouter.get("/tenants", requireUserAuth(), async (req, res, next) => {
  const user = req.financeUser;
  if (!user) {
    res.status(401).json({
      error: { code: "UNAUTHENTICATED", message: "A valid user access token is required." },
    });
    return;
  }

  try {
    const tenants = await userTenantDirectoryRepository.listActiveTenantsForIdentity(user.issuer, user.id);
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      data: {
        tenants: tenants.map((tenant) => ({
          id: tenant.id,
          tenantCode: tenant.tenant_code,
          legalName: tenant.legal_name,
          role: tenant.role_code,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
});
