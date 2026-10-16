import Fastify from "fastify";
import { env } from "./config/env.js";
import { pool } from "./db/pool.js";

export const app = Fastify({
  logger: { level: env.LOG_LEVEL, redact: ["req.headers.authorization", "req.headers.cookie"] },
  disableRequestLogging: false,
  requestIdHeader: "x-correlation-id",
  genReqId: (request) => {
    const supplied = request.headers["x-correlation-id"];
    return typeof supplied === "string" && supplied.length <= 100
      ? supplied
      : crypto.randomUUID();
  },
});

app.get("/health", async () => ({
  status: "ok",
  service: "zenox-finance",
  version: "0.1.0",
}));

app.get("/ready", async (_request, reply) => {
  try {
    await pool.query("SELECT 1");
    return { status: "ready", database: "reachable" };
  } catch {
    return reply.code(503).send({ status: "not_ready", database: "unavailable" });
  }
});

app.setNotFoundHandler((_request, reply) => {
  return reply.code(404).send({
    error: { code: "NOT_FOUND", message: "The requested resource does not exist." },
  });
});

const close = async () => {
  await app.close();
  await pool.end();
};

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const start = async () => {
    try {
      await app.listen({ host: env.HOST, port: env.PORT });
    } catch (error) {
      app.log.error({ err: error }, "Failed to start server");
      process.exitCode = 1;
    }
  };

  process.once("SIGINT", () => void close());
  process.once("SIGTERM", () => void close());
  void start();
}
