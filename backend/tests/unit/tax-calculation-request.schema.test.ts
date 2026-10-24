import { describe, expect, it } from "vitest";
import { calculateAndSnapshotTaxSchema } from "../../src/modules/tax/validators/tax-calculation-request.schema.js";

const validRequest = {
  documentType: "INVOICE",
  documentId: "11111111-1111-4111-8111-111111111111",
  documentVersion: 1,
  taxDate: "2026-10-16",
  currencyCode: "XOF",
  jurisdictionId: "22222222-2222-4222-8222-222222222222",
  appliesTo: "FREIGHT",
  amount: "12500",
};

describe("calculateAndSnapshotTaxSchema", () => {
  it("accepts business inputs without accepting caller-supplied tax results", () => {
    expect(calculateAndSnapshotTaxSchema.parse(validRequest)).toEqual(validRequest);
  });

  it("rejects client-supplied result snapshots and calculation policy", () => {
    expect(() => calculateAndSnapshotTaxSchema.parse({
      ...validRequest,
      resultSnapshot: { grandTotal: "1" },
      calculationPolicy: "CLIENT_CHOSEN",
    })).toThrow();
  });

  it("rejects invalid currency, date, UUID, amount and unsupported category", () => {
    for (const invalid of [
      { ...validRequest, currencyCode: "EURO" },
      { ...validRequest, taxDate: "16-10-2026" },
      { ...validRequest, jurisdictionId: "not-a-uuid" },
      { ...validRequest, amount: "-1" },
      { ...validRequest, appliesTo: "CUSTOMS" },
    ]) {
      expect(() => calculateAndSnapshotTaxSchema.parse(invalid)).toThrow();
    }
  });

  it("accepts only the supported optional tax applicability facts", () => {
    expect(calculateAndSnapshotTaxSchema.parse({
      ...validRequest,
      taxFacts: {
        transactionType: "FREIGHT",
        supplierIfuStatus: "REGISTERED",
        customerCountryCode: "BJ",
        isImport: false,
      },
    }).taxFacts).toEqual({
      transactionType: "FREIGHT",
      supplierIfuStatus: "REGISTERED",
      customerCountryCode: "BJ",
      isImport: false,
    });

    expect(() => calculateAndSnapshotTaxSchema.parse({
      ...validRequest,
      taxFacts: { tenantId: "client-controlled" },
    })).toThrow();

    expect(() => calculateAndSnapshotTaxSchema.parse({
      ...validRequest,
      taxFacts: { customerCountryCode: "BEN" },
    })).toThrow();
  });

  it("rejects unknown fields to prevent silent contract drift", () => {
    expect(() => calculateAndSnapshotTaxSchema.parse({ ...validRequest, tenantId: "client-controlled" })).toThrow();
  });
});
