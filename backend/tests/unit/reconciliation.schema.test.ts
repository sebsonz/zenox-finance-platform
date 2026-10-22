import { describe, expect, it } from "vitest";
import {
  reconciliationImportSchema,
  reconciliationListQuerySchema,
  reconciliationMatchSchema,
} from "../../src/modules/payments/validators/reconciliation.schema.js";

describe("payment reconciliation schemas", () => {
  it("accepts a valid import and normalizes currency codes", () => {
    const parsed = reconciliationImportSchema.parse({
      rows: [{
        providerCode: "test-provider",
        externalReference: "txn-001",
        amount: "1200.50",
        currencyCode: "xof",
        transactionDate: "2026-10-22T10:00:00Z",
        safeMetadata: { source: "csv" },
      }],
    });
    expect(parsed.rows[0]?.currencyCode).toBe("XOF");
    expect(parsed.rows).toHaveLength(1);
  });

  it("rejects duplicate provider/reference pairs within one import", () => {
    expect(() => reconciliationImportSchema.parse({
      rows: [
        { providerCode: "test-provider", externalReference: "txn-001", amount: "10", currencyCode: "XOF" },
        { providerCode: "test-provider", externalReference: "txn-001", amount: "10", currencyCode: "XOF" },
      ],
    })).toThrow();
  });

  it("limits imports to 500 rows and rejects invalid amounts", () => {
    expect(() => reconciliationImportSchema.parse({
      rows: Array.from({ length: 501 }, (_, i) => ({
        providerCode: "test-provider", externalReference: `txn-${i}`, amount: "1", currencyCode: "XOF",
      })),
    })).toThrow();
    expect(() => reconciliationImportSchema.parse({
      rows: [{ providerCode: "test-provider", externalReference: "txn-001", amount: "0", currencyCode: "XOF" }],
    })).toThrow();
  });

  it("allows filtered or unfiltered listing with bounded pagination", () => {
    expect(reconciliationListQuerySchema.parse({ limit: "50" })).toMatchObject({ limit: 50 });
    expect(() => reconciliationListQuerySchema.parse({ limit: "500" })).toThrow();
    expect(reconciliationListQuerySchema.parse({ status: "CONFLICT", providerCode: "test-provider" }).status).toBe("CONFLICT");
  });

  it("accepts an optional explicit payment match only as a UUID", () => {
    expect(reconciliationMatchSchema.parse({}).paymentId).toBeUndefined();
    expect(reconciliationMatchSchema.parse({ paymentId: "11111111-1111-4111-8111-111111111111" }).paymentId)
      .toBe("11111111-1111-4111-8111-111111111111");
    expect(() => reconciliationMatchSchema.parse({ paymentId: "not-a-uuid" })).toThrow();
  });
});
