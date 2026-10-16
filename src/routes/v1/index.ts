import { Router } from "express";
import { healthRouter } from "../../modules/health/routes/health.routes.js";
import { taxCalculationRouter } from "../../modules/tax/routes/tax-calculation.routes.js";
import { userTenantAccessRouter } from "../../modules/user-auth/routes/user-tenant-access.routes.js";
import { invoiceDraftRouter } from "../../modules/invoices/routes/invoice-draft.routes.js";

export const apiV1Router = Router();
apiV1Router.use("/health", healthRouter);
apiV1Router.use("/tax", taxCalculationRouter);
apiV1Router.use("/user", userTenantAccessRouter);
apiV1Router.use("/invoices", invoiceDraftRouter);
