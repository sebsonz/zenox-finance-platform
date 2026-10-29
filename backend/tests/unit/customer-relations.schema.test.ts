import { describe, expect, it } from "vitest";
import {
  createCustomerAddressSchema,
  createCustomerContactSchema,
  listCustomerRelationsQuerySchema,
} from "../../src/modules/customers/validators/customer-relations.schema.js";
import { updateCustomerSchema } from "../../src/modules/customers/validators/customer.schema.js";

describe("M04 customer relation schemas", () => {
  it("normalizes contact input and rejects unknown fields", () => {
    expect(createCustomerContactSchema.parse({
      fullName: "  Awa Mensah  ",
      contactType: "BILLING",
      email: "awa@example.com",
      isPrimary: true,
    })).toMatchObject({
      fullName: "Awa Mensah",
      contactType: "BILLING",
      email: "awa@example.com",
      isPrimary: true,
    });
    expect(createCustomerContactSchema.safeParse({ fullName: "Awa", tenantId: "forged" }).success).toBe(false);
    expect(createCustomerContactSchema.safeParse({ fullName: " " }).success).toBe(false);
  });

  it("normalizes and validates addresses", () => {
    expect(createCustomerAddressSchema.parse({
      addressType: "BILLING",
      addressLine1: "  12 Rue du Port ",
      city: "Cotonou",
      countryCode: "bj",
    })).toMatchObject({
      addressType: "BILLING",
      addressLine1: "12 Rue du Port",
      city: "Cotonou",
      countryCode: "BJ",
      isPrimary: false,
    });
    expect(createCustomerAddressSchema.safeParse({
      addressType: "BILLING",
      addressLine1: "12 Rue du Port",
      city: "Cotonou",
      countryCode: "BEN",
    }).success).toBe(false);
    expect(createCustomerAddressSchema.safeParse({
      addressType: "UNKNOWN",
      addressLine1: "12 Rue du Port",
      city: "Cotonou",
      countryCode: "BJ",
    }).success).toBe(false);
  });

  it("bounds relation pagination and requires a non-empty customer patch", () => {
    expect(listCustomerRelationsQuerySchema.parse({ limit: "20", status: "ACTIVE" })).toMatchObject({
      limit: 20,
      status: "ACTIVE",
    });
    expect(listCustomerRelationsQuerySchema.safeParse({ limit: "500" }).success).toBe(false);
    expect(updateCustomerSchema.safeParse({}).success).toBe(false);
    expect(updateCustomerSchema.safeParse({ legalName: "Updated name", tenantId: "forged" }).success).toBe(false);
    expect(updateCustomerSchema.parse({ email: null })).toEqual({ email: null });
  });
});
