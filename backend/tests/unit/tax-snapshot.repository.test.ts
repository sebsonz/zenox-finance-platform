import { describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import { taxSnapshotRepository } from "../../src/modules/tax/repositories/tax-snapshot.repository.js";
import type { CreateTaxSnapshotInput } from "../../src/modules/tax/validators/tax-snapshot.schema.js";

const input: CreateTaxSnapshotInput = {
  documentType: "INVOICE",
  documentId: "7c58f5f7-2dca-4ed1-a0db-8cc7d77f5c41",
  documentVersion: 1,
  calculationPolicy: "TAX_STACK_HALF_UP_V1",
  engineVersion: "0.1.0",
  taxDate: "2026-10-16",
  currencyCode: "XOF",
  jurisdictionId: "d04a7b8a-c6c6-4f87-9b58-21e08d2d8f93",
  inputSnapshot: { amount: "10000" },
  resultSnapshot: { grandTotal: "11800" },
  appliedRulesSnapshot: [{ ruleCode: "BJ_VAT_18", version: 1 }],
};

const row = {
  id: "1f1eec3b-0a8f-41ef-a19e-7f315b5e62c0",
  tenant_id: "aaed3b9a-f4f4-44b9-94b0-81731c8b27e5",
  document_type: "INVOICE" as const,
  document_id: input.documentId,
  document_version: 1,
  calculation_policy: input.calculationPolicy,
  engine_version: input.engineVersion,
  tax_date: input.taxDate,
  currency_code: "XOF",
  currency_minor_unit: 0,
  jurisdiction_id: input.jurisdictionId ?? null,
  input_snapshot: input.inputSnapshot,
  result_snapshot: input.resultSnapshot,
  applied_rules_snapshot: [...input.appliedRulesSnapshot],
  created_at: "2026-10-16T10:00:00.000Z",
  created_by: "b2e9e0b7-1a23-4f4e-b3c5-58c4b4c86a44",
  created_by_actor_ref: "b2e9e0b7-1a23-4f4e-b3c5-58c4b4c86a44",
};

const context = {
  tenantId: row.tenant_id,
  correlationId: "test-correlation",
  principal: {
    id: row.created_by,
    principalCode: "test-service",
    displayName: "Test service",
    scopes: ["tax:snapshot:write"],
    allowedTenantIds: [row.tenant_id],
  },
};

function fakeClient(rows: unknown[]) {
  const query = vi.fn().mockResolvedValue({ rows });
  return { client: { query } as unknown as PoolClient, query };
}

describe("taxSnapshotRepository", () => {
  it("inserts a snapshot with tenant, creator, currency precision and frozen JSON values", async () => {
    const { client, query } = fakeClient([row]);
    const result = await taxSnapshotRepository.create(
      client,
      context,
      0,
      input,
    );

    expect(query).toHaveBeenCalledOnce();
    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain("INSERT INTO public.finance_tax_calculation_snapshots");
    expect(params).toEqual([
      row.tenant_id, "INVOICE", input.documentId, 1,
      input.calculationPolicy, input.engineVersion, input.taxDate, "XOF",
      0, input.jurisdictionId,
      JSON.stringify(input.inputSnapshot), JSON.stringify(input.resultSnapshot),
      JSON.stringify(input.appliedRulesSnapshot), null, "SERVICE", row.created_by,
    ]);
    expect(result).toMatchObject({
      id: row.id,
      tenantId: row.tenant_id,
      currencyMinorUnit: 0,
      resultSnapshot: { grandTotal: "11800" },
    });
  });

  it("reads by document type, ID and version using parameterized values", async () => {
    const { client, query } = fakeClient([row]);
    const result = await taxSnapshotRepository.findByDocumentVersion(
      client, row.tenant_id, "INVOICE", input.documentId, 1,
    );

    expect(query).toHaveBeenCalledOnce();
    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain("FROM public.finance_tax_calculation_snapshots");
    expect(params).toEqual([row.tenant_id, "INVOICE", input.documentId, 1]);
    expect(result?.documentVersion).toBe(1);
    expect(result?.appliedRulesSnapshot[0]).toMatchObject({ ruleCode: "BJ_VAT_18" });
  });

  it("returns null when no snapshot exists for the requested version", async () => {
    const { client } = fakeClient([]);
    await expect(taxSnapshotRepository.findByDocumentVersion(
      client, row.tenant_id, "INVOICE", input.documentId, 2,
    )).resolves.toBeNull();
  });

  it("fails closed if INSERT unexpectedly returns no row", async () => {
    const { client } = fakeClient([]);
    await expect(taxSnapshotRepository.create(
      client, context, 0, input,
    )).rejects.toThrow("TAX_SNAPSHOT_INSERT_RETURNED_NO_ROW");
  });
});
