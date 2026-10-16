import { Router } from "express";
import { healthRouter } from "../../modules/health/routes/health.routes.js";

export const apiV1Router = Router();
apiV1Router.use("/health", healthRouter);
