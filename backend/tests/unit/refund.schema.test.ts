import { describe, expect, it } from "vitest";
import { createRefundSchema, recordManualRefundSuccessSchema } from "../../src/modules/payments/validators/refund.schema.js";

describe("refund schemas", () => {
  it("accepts positive bounded decimal amounts and normalizes the reason", () => {
    expect(createRefundSchema.parse({amount:"125.00",reason:"  Customer overpayment  "}))
      .toEqual({amount:"125.00",reason:"Customer overpayment"});
  });

  it("rejects zero, negative, scientific-notation and over-precision amounts", () => {
    for (const amount of ["0","-1","1e3","1.123456789","123456789012345678"]) {
      expect(() => createRefundSchema.parse({amount,reason:"Valid refund reason"})).toThrow();
    }
  });

  it("rejects unknown tenant or lifecycle fields supplied by callers", () => {
    expect(() => createRefundSchema.parse({amount:"1",reason:"Duplicate transfer",tenantId:"attacker"})).toThrow();
    expect(() => createRefundSchema.parse({amount:"1",reason:"Duplicate transfer",status:"SUCCEEDED"})).toThrow();
  });

  it("validates optional manual refund references and rejects extra fields", () => {
    expect(recordManualRefundSuccessSchema.parse({externalReference:"MM-REF-001"}))
      .toEqual({externalReference:"MM-REF-001"});
    expect(recordManualRefundSuccessSchema.parse({})).toEqual({});
    expect(() => recordManualRefundSuccessSchema.parse({status:"SUCCEEDED"})).toThrow();
  });
});
