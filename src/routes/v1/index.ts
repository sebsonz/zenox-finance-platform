import { Router } from "express";
import { healthRouter } from "../../modules/health/routes/health.routes.js";
import { taxCalculationRouter } from "../../modules/tax/routes/tax-calculation.routes.js";
import { userTenantAccessRouter } from "../../modules/user-auth/routes/user-tenant-access.routes.js";
import { invoiceDraftRouter } from "../../modules/invoices/routes/invoice-draft.routes.js";
import { customerRouter } from "../../modules/customers/routes/customer.routes.js";
import { currencyRouter } from "../../modules/currencies/routes/currency.routes.js";
import { invoiceTaxSnapshotRouter } from "../../modules/invoices/routes/invoice-tax-snapshot.routes.js";

export const apiV1Router = Router();
apiV1Router.use("/health", healthRouter);
apiV1Router.use("/tax", taxCalculationRouter);
apiV1Router.use("/user", userTenantAccessRouter);
apiV1Router.use("/invoices", invoiceTaxSnapshotRouter);
apiV1Router.use("/invoices", invoiceDraftRouter);
apiV1Router.use("/customers", customerRouter);
apiV1Router.use("/currencies", currencyRouter);
