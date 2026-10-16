import express, { type ErrorRequestHandler, type Request, type Response, type NextFunction } from "express";
import { randomUUID } from "node:crypto";
import { env } from "./config/env.js";
import { apiV1Router } from "./routes/v1/index.js";

export const app = express();
app.disable("x-powered-by");

app.use((req, res, next) => {
  const supplied = req.header("x-correlation-id");
  const correlationId = supplied && supplied.length <= 100 ? supplied : randomUUID();
  res.setHeader("x-correlation-id", correlationId);
  res.locals.correlationId = correlationId;
  next();
});

app.use(express.json({ limit: "256kb", strict: true }));
app.use("/api/v1", apiV1Router);

app.use((_req: Request, res: Response) => {
  res.status(404).json({
    error: { code: "NOT_FOUND", message: "The requested resource does not exist." },
  });
});

const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next: NextFunction) => {
  const requestId = String(res.locals.correlationId ?? "unknown");
  app.locals.logger.error({ requestId, errorName: error instanceof Error ? error.name : "UnknownError" }, "Unhandled request error");
  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred.", requestId },
  });
};
app.use(errorHandler);

app.locals.logger = {
  info: (data: unknown, message: string) => {
    if (env.LOG_LEVEL !== "silent") process.stdout.write(JSON.stringify({ level: "info", message, data }) + "\n");
  },
  error: (data: unknown, message: string) => {
    if (env.LOG_LEVEL !== "silent") process.stderr.write(JSON.stringify({ level: "error", message, data }) + "\n");
  },
};

export default app;
