import { Router } from "express";
import { z } from "zod";
import { requireUserAuth } from "../../../middleware/require-user-auth.js";
import { platformAdminAccessService, PlatformAdminAccessError } from "../services/platform-admin-access.service.js";
import { platformUserDirectoryRepository } from "../repositories/platform-user-directory.repository.js";

export const platformUserDirectoryRouter = Router();
const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(25),
  q: z.string().trim().max(120).default(""),
  status: z.enum(["ALL", "ACTIVE", "SUSPENDED", "DELETED"]).default("ALL"),
}).strict();

platformUserDirectoryRouter.get("/users", requireUserAuth(), async (req, res, next) => {
  try {
    await platformAdminAccessService.assertActiveOperator(req.financeUser);
  } catch (error) {
    if (error instanceof PlatformAdminAccessError) {
      res.status(error.status).json({ error: { code: error.code, message: error.message } });
      return;
    }
    next(error); return;
  }
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "INVALID_USER_DIRECTORY_QUERY", message: "Les filtres du répertoire sont invalides." } });
    return;
  }
  try {
    const result = await platformUserDirectoryRepository.list({
      operatorIssuer: req.financeUser!.issuer,
      operatorSubject: req.financeUser!.id,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
      query: parsed.data.q,
      status: parsed.data.status,
    });
    res.setHeader("Cache-Control", "no-store, private");
    res.setHeader("Pragma", "no-cache");
    res.status(200).json({ data: result });
  } catch (error) {
    const databaseError = error as { code?: string };
    if (databaseError.code === "42501") {
      res.status(403).json({ error: { code: "PLATFORM_OPERATOR_REQUIRED", message: "Une autorisation d’administration de la plateforme est requise." } });
      return;
    }
    next(error);
  }
});
