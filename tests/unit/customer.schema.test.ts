import { describe, expect, it } from "vitest";
import { createCustomerSchema, listCustomersQuerySchema } from "../../src/modules/customers/validators/customer.schema.js";

describe("customer schemas", () => {
  it("normalizes reference fields and trims text", () => {
    const parsed = createCustomerSchema.parse({
      customerCode: " CUST_01 ",
      customerType: "BUSINESS",
      legalName: "  Client Test  ",
      countryCode: "bj",
      defaultCurrency: "xof",
      phone: "  +229 00 00 00 00 ",
    });
    expect(parsed).toMatchObject({
      customerCode: "CUST_01",
      legalName: "Client Test",
      countryCode: "BJ",
      defaultCurrency: "XOF",
      phone: "+229 00 00 00 00",
    });
  });

  it("rejects unknown financial result fields and incomplete external identities", () => {
    expect(createCustomerSchema.safeParse({
      customerCode: "CUST_01",
      customerType: "BUSINESS",
      legalName: "Client Test",
      countryCode: "BJ",
      total: "100",
    }).success).toBe(false);

    expect(createCustomerSchema.safeParse({
      customerCode: "CUST_01",
      customerType: "BUSINESS",
      legalName: "Client Test",
      countryCode: "BJ",
      externalSystem: "legacy",
    }).success).toBe(false);
  });

  it("enforces bounded, strict cursor query validation", () => {
    expect(listCustomersQuerySchema.parse({ limit: "25", q: " Acme ", status: "ACTIVE" })).toMatchObject({
      limit: 25,
      q: "Acme",
      status: "ACTIVE",
    });
    expect(listCustomersQuerySchema.safeParse({ limit: "1000" }).success).toBe(false);
    expect(listCustomersQuerySchema.safeParse({ cursor: "not-a-uuid" }).success).toBe(false);
    expect(listCustomersQuerySchema.safeParse({ unknown: "1" }).success).toBe(false);
  });
});
