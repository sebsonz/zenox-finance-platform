import { Router } from "express";
import { requireUserAuth } from "../../../middleware/require-user-auth.js";
import { listTaxJurisdictions, taxJurisdictionListQuerySchema } from "../../tax/index.js";
import { PlatformAdminAccessError, platformAdminAccessService } from "../services/platform-admin-access.service.js";

export const platformAdminRouter = Router();

platformAdminRouter.get("/tax/jurisdictions", requireUserAuth(), async (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    await platformAdminAccessService.assertActiveOperator(req.financeUser);
  } catch (error) {
    if (error instanceof PlatformAdminAccessError) {
      res.setHeader("Cache-Control", "no-store");
      res.status(error.status).json({
        error: { code: error.code, message: error.message },
      });
      return;
    }
    next(error);
    return;
  }

  const parsed = taxJurisdictionListQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Les filtres de juridiction sont invalides.",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          code: issue.code,
        })),
      },
    });
    return;
  }

  try {
    const page = await listTaxJurisdictions.execute(parsed.data);
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ data: page });
  } catch (error) {
    next(error);
  }
});
