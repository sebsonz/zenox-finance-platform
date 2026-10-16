import { env } from "./config/env.js";
import { app } from "./app.js";
import { pool } from "./db/pool.js";

const server = app.listen(env.PORT, env.HOST, () => {
  app.locals["logger"].info({ host: env.HOST, port: env.PORT }, "ZENOX Finance API listening");
});

const shutdown = (signal: string): void => {
  app.locals["logger"].info({ signal }, "Shutting down ZENOX Finance API");
  server.close((error) => {
    if (error) {
      app.locals["logger"].error({ errorName: error.name }, "HTTP server shutdown failed");
      process.exitCode = 1;
    }
    void pool.end().finally(() => process.exit());
  });
};

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
