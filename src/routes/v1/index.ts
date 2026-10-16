import { Router } from "express";
import { healthRouter } from "../../modules/health/routes/health.routes.js";
import { taxSnapshotRouter } from "../../modules/tax/routes/tax-snapshot.routes.js";

export const apiV1Router = Router();
apiV1Router.use("/health", healthRouter);
apiV1Router.use("/tax", taxSnapshotRouter);
