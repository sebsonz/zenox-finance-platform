import { Router } from "express";
import { healthRouter } from "../../modules/health/routes/health.routes.js";
import { taxCalculationRouter } from "../../modules/tax/routes/tax-calculation.routes.js";
import { customerRouter } from "../../modules/customers/routes/customer.routes.js";
import { currencyRouter } from "../../modules/currencies/routes/currency.routes.js";
import { invoicesRouter } from "../../modules/invoices/routes/index.js";
import { userAuthRouter } from "../../modules/user-auth/routes/index.js";
import { platformAdminRouter } from "../../modules/platform-admin/routes/platform-admin.routes.js";

export const apiV1Router = Router();

apiV1Router.use("/health", healthRouter);
apiV1Router.use("/tax", taxCalculationRouter);
apiV1Router.use("/user/platform", platformAdminRouter);
apiV1Router.use("/user", userAuthRouter);
apiV1Router.use("/invoices", invoicesRouter);
apiV1Router.use("/customers", customerRouter);
apiV1Router.use("/currencies", currencyRouter);
