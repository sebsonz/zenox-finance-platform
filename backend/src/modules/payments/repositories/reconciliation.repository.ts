import type { PoolClient } from "pg";
import type { FinanceRequestContext } from "../../integration-auth/types/authenticated-principal.js";
import { recordPaymentAudit } from "./payment-audit.repository.js";
import type {
  ReconciliationImportInput,
  ReconciliationListQuery,
  ReconciliationMatchInput,
} from "../validators/reconciliation.schema.js";

interface ReconciliationRow {
  id: string;
  provider_code: string;
  external_reference: string;
  amount: string;
  currency_code: string;
  transaction_date: string | null;
  status: "UNMATCHED" | "MATCHED" | "CONFLICT" | "IGNORED";
  matched_payment_id: string | null;
  import_batch_id: string;
  safe_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

const columns = `id, provider_code, external_reference, amount::text,
  btrim(currency_code) AS currency_code,
  CASE WHEN transaction_date IS NULL THEN NULL ELSE to_char(transaction_date AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END AS transaction_date,
  status, matched_payment_id, import_batch_id, safe_metadata,
  to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at,
  to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at`;

function mapRow(row: ReconciliationRow) {
  return {
    id: row.id,
    providerCode: row.provider_code,
    externalReference: row.external_reference,
    amount: row.amount,
    currencyCode: row.currency_code,
    transactionDate: row.transaction_date,
    status: row.status,
    matchedPaymentId: row.matched_payment_id,
    importBatchId: row.import_batch_id,
    safeMetadata: row.safe_metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeAmount(value: string): string {
  const [whole, fraction = ""] = value.split(".");
  return `${whole}.${fraction.replace(/0+$/, "") || "0"}`;
}

export const reconciliationRepository = {
  async importRows(client: PoolClient, context: FinanceRequestContext, input: ReconciliationImportInput) {
    const batchIdResult = await client.query<{ id: string }>("SELECT gen_random_uuid()::text AS id");
    const batchId = batchIdResult.rows[0]?.id;
    if (!batchId) throw new Error("RECONCILIATION_BATCH_ID_FAILED");

    const imported: ReconciliationRow[] = [];
    let inserted = 0;
    let duplicates = 0;
    let conflicts = 0;

    for (const item of input.rows) {
      const existing = await client.query<ReconciliationRow>(
        `SELECT ${columns} FROM public.finance_payment_reconciliation_items
          WHERE tenant_id = $1 AND provider_code = $2 AND external_reference = $3 FOR UPDATE`,
        [context.tenantId, item.providerCode, item.externalReference],
      );
      const prior = existing.rows[0];
      if (prior) {
        duplicates += 1;
        const samePayload =
          normalizeAmount(prior.amount) === normalizeAmount(item.amount) &&
          prior.currency_code.trim() === item.currencyCode &&
          (prior.transaction_date === null && item.transactionDate === undefined) ||
          (prior.transaction_date !== null && item.transactionDate !== undefined &&
            Date.parse(prior.transaction_date) === Date.parse(item.transactionDate));
        if (!samePayload && prior.status !== "MATCHED" && prior.status !== "IGNORED") {
          const updated = await client.query<ReconciliationRow>(
            `UPDATE public.finance_payment_reconciliation_items
                SET status = 'CONFLICT', updated_at = now()
              WHERE tenant_id = $1 AND id = $2
              RETURNING ${columns}`,
            [context.tenantId, prior.id],
          );
          if (updated.rows[0]) {
            imported.push(updated.rows[0]);
            conflicts += 1;
          }
        } else {
          imported.push(prior);
        }
        continue;
      }

      const result = await client.query<ReconciliationRow>(
        `INSERT INTO public.finance_payment_reconciliation_items
          (tenant_id, provider_code, external_reference, amount, currency_code, transaction_date,
           status, import_batch_id, safe_metadata)
         VALUES ($1,$2,$3,$4,$5,$6,'UNMATCHED',$7,$8::jsonb)
         ON CONFLICT (tenant_id, provider_code, external_reference) DO NOTHING
         RETURNING ${columns}`,
        [context.tenantId, item.providerCode, item.externalReference, item.amount, item.currencyCode,
          item.transactionDate ?? null, batchId, JSON.stringify(item.safeMetadata ?? {})],
      );
      if (result.rows[0]) {
        inserted += 1;
        imported.push(result.rows[0]);
      } else {
        // A concurrent import won the unique-key race. Re-read and preserve its state.
        const concurrent = await client.query<ReconciliationRow>(
          `SELECT ${columns} FROM public.finance_payment_reconciliation_items
            WHERE tenant_id = $1 AND provider_code = $2 AND external_reference = $3`,
          [context.tenantId, item.providerCode, item.externalReference],
        );
        if (concurrent.rows[0]) {
          duplicates += 1;
          imported.push(concurrent.rows[0]);
        }
      }
    }

    await recordPaymentAudit(client, context, "PAYMENT_RECONCILIATION_IMPORTED", "PAYMENT_RECONCILIATION_BATCH", batchId, {
      rowsReceived: input.rows.length, inserted, duplicates, conflicts,
    });
    return { batchId, received: input.rows.length, inserted, duplicates, conflicts, items: imported.map(mapRow) };
  },

  async list(client: PoolClient, context: FinanceRequestContext, query: ReconciliationListQuery) {
    const result = await client.query<ReconciliationRow>(
      `SELECT ${columns} FROM public.finance_payment_reconciliation_items
        WHERE tenant_id = $1
          AND ($2::text IS NULL OR status = $2)
          AND ($3::text IS NULL OR provider_code = $3)
          AND ($4::uuid IS NULL OR id < $4::uuid)
        ORDER BY id DESC LIMIT $5`,
      [context.tenantId, query.status ?? null, query.providerCode ?? null, query.cursor ?? null, query.limit],
    );
    return { items: result.rows.map(mapRow), nextCursor: result.rows.length === query.limit ? result.rows[result.rows.length - 1]?.id ?? null : null };
  },

  async match(client: PoolClient, context: FinanceRequestContext, itemId: string, input: ReconciliationMatchInput) {
    const itemResult = await client.query<ReconciliationRow>(
      `SELECT ${columns} FROM public.finance_payment_reconciliation_items
        WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
      [context.tenantId, itemId],
    );
    const item = itemResult.rows[0];
    if (!item) throw new Error("RECONCILIATION_ITEM_NOT_FOUND");
    if (item.status === "IGNORED") throw new Error("RECONCILIATION_ITEM_IGNORED");
    if (item.status === "MATCHED") {
      if (!input.paymentId || input.paymentId === item.matched_payment_id) return mapRow(item);
      throw new Error("RECONCILIATION_ALREADY_MATCHED");
    }

    const payments = input.paymentId
      ? await client.query<{ id: string; amount: string; currency_code: string; status: string }>(
          `SELECT id, amount::text, btrim(currency_code) AS currency_code, status
             FROM public.finance_payments
            WHERE tenant_id = $1 AND id = $2 AND provider_code = $3 AND external_reference = $4
            FOR UPDATE`,
          [context.tenantId, input.paymentId, item.provider_code, item.external_reference],
        )
      : await client.query<{ id: string; amount: string; currency_code: string; status: string }>(
          `SELECT id, amount::text, btrim(currency_code) AS currency_code, status
             FROM public.finance_payments
            WHERE tenant_id = $1 AND provider_code = $2 AND external_reference = $3
            ORDER BY created_at DESC LIMIT 2 FOR UPDATE`,
          [context.tenantId, item.provider_code, item.external_reference],
        );

    if (input.paymentId && payments.rows.length === 0) throw new Error("RECONCILIATION_PAYMENT_NOT_FOUND");
    const exact = payments.rows.filter((payment) =>
      ["CONFIRMED", "SETTLED"].includes(payment.status) &&
      normalizeAmount(payment.amount) === normalizeAmount(item.amount) &&
      payment.currency_code.trim() === item.currency_code.trim(),
    );
    const status = exact.length === 1 ? "MATCHED" : payments.rows.length === 0 && !input.paymentId ? "UNMATCHED" : "CONFLICT";
    const paymentId = status === "MATCHED" ? exact[0]?.id ?? null : null;
    const updated = await client.query<ReconciliationRow>(
      `UPDATE public.finance_payment_reconciliation_items
          SET status = $3, matched_payment_id = $4, updated_at = now()
        WHERE tenant_id = $1 AND id = $2
        RETURNING ${columns}`,
      [context.tenantId, itemId, status, paymentId],
    );
    const row = updated.rows[0];
    if (!row) throw new Error("RECONCILIATION_ITEM_NOT_FOUND");
    await recordPaymentAudit(client, context, "PAYMENT_RECONCILIATION_MATCH_ATTEMPTED", "PAYMENT_RECONCILIATION_ITEM", itemId, {
      outcome: status, matchedPaymentId: paymentId,
    });
    return mapRow(row);
  },
};
