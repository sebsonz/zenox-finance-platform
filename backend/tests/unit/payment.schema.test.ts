import { describe, expect, it } from "vitest";
import { allocatePaymentSchema, createPaymentSchema, reverseAllocationSchema } from "../../src/modules/payments/validators/payment.schema.js";

describe("payment schemas", () => {
  it("accepts a valid manual payment without allowing caller-selected status", () => {
    expect(createPaymentSchema.parse({
      amount: "12500.00",
      currencyCode: "xof",
      source: "MANUAL",
      method: "MOBILE_MONEY",
      externalReference: "MM-12345",
    })).toMatchObject({ amount: "12500.00", currencyCode: "XOF", source: "MANUAL" });
    expect(() => createPaymentSchema.parse({
      amount: "100", currencyCode: "XOF", source: "MANUAL", method: "CASH", status: "CONFIRMED",
    })).toThrow();
  });

  it("requires provider configuration for provider-originated payment requests", () => {
    expect(() => createPaymentSchema.parse({
      amount: "100", currencyCode: "XOF", source: "PROVIDER", method: "PROVIDER",
    })).toThrow();
    expect(createPaymentSchema.parse({
      amount: "100", currencyCode: "XOF", source: "PROVIDER", method: "PROVIDER", providerCode: "test-provider",
    }).source).toBe("PROVIDER");
  });

  it("rejects zero allocations and unexpected fields", () => {
    expect(() => allocatePaymentSchema.parse({
      invoiceId: "11111111-1111-4111-8111-111111111111", amount: "0",
    })).toThrow();
    expect(() => allocatePaymentSchema.parse({
      invoiceId: "11111111-1111-4111-8111-111111111111", amount: "1", tenantId: "client-controlled",
    })).toThrow();
  });

  it("requires a reason for allocation reversals", () => {
    expect(() => reverseAllocationSchema.parse({ amount: "1", reason: "x" })).toThrow();
    expect(reverseAllocationSchema.parse({ amount: "1.25", reason: "Duplicate allocation" }).amount).toBe("1.25");
  });
});
