import { describe, expect, it } from "vitest";
import { createCustomerSchema, listCustomersQuerySchema } from "../../src/modules/customers/validators/customer.schema.js";

describe("customer contracts", () => {
  it("normalizes country and currency codes and applies safe defaults", () => {
    const result = createCustomerSchema.parse({
      customerCode: "CUST_001",
      customerType: "BUSINESS",
      legalName: "  ZENOX Client SARL  ",
      countryCode: "bj",
      defaultCurrency: "xof",
    });

    expect(result.legalName).toBe("ZENOX Client SARL");
    expect(result.countryCode).toBe("BJ");
    expect(result.defaultCurrency).toBe("XOF");
    expect(result.metadata).toEqual({});
  });

  it("requires external identity fields as a pair", () => {
    const result = createCustomerSchema.safeParse({
      customerCode: "CUST_002",
      customerType: "INDIVIDUAL",
      legalName: "Example Customer",
      countryCode: "BJ",
      externalSystem: "ZENox-fret",
    });

    expect(result.success).toBe(false);
  });

  it("rejects unknown input properties", () => {
    const result = createCustomerSchema.safeParse({
      customerCode: "CUST_003",
      customerType: "BUSINESS",
      legalName: "Example SARL",
      countryCode: "BJ",
      tenantId: "client-supplied-tenant",
    });

    expect(result.success).toBe(false);
  });

  it("bounds list pagination and defaults to active customers", () => {
    expect(listCustomersQuerySchema.parse({}).status).toBe("ACTIVE");
    expect(listCustomersQuerySchema.parse({ limit: "50" }).limit).toBe(50);
    expect(listCustomersQuerySchema.safeParse({ limit: "500" }).success).toBe(false);
  });
});
