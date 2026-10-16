import pg from "pg";
import { env } from "../config/env.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  application_name: "zenox-finance-api",
  // TLS policy should be set by deployment configuration. Do not disable
  // certificate verification in production to work around connection errors.
});

pool.on("error", (error: Error) => {
  // Do not log connection strings, credentials, or query parameters.
  console.error("Unexpected idle PostgreSQL client error", { name: error.name });
});
