import type { PoolClient } from "pg";
import { z } from "zod";
import { pool } from "./pool.js";

const tenantIdSchema = z.string().uuid();

export async function withTenantTransaction<T>(
  tenantId: string,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const validatedTenantId = tenantIdSchema.parse(tenantId);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    // Transaction-local context is cleared automatically on COMMIT/ROLLBACK
    // and cannot leak when the pooled connection is reused.
    await client.query(
      "SELECT set_config('app.tenant_id', $1, true)",
      [validatedTenantId],
    );

    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the original operation error.
    }
    throw error;
  } finally {
    client.release();
  }
}
