import { describe, expect, it } from "vitest";
import { isContractTotalGreaterThanInvoiceTotal } from "../../src/modules/invoices/domain/invoice-document-type.js";

describe("deposit invoice contract total invariant", () => {
  it("accepts a contract total strictly greater than the calculated deposit total", () => {
    expect(isContractTotalGreaterThanInvoiceTotal("1000", "250")).toBe(true);
  });

  it("rejects a contract total equal to the calculated deposit total", () => {
    expect(isContractTotalGreaterThanInvoiceTotal("250", "250")).toBe(false);
  });

  it("rejects a contract total lower than the calculated deposit total", () => {
    expect(isContractTotalGreaterThanInvoiceTotal("100", "250")).toBe(false);
  });

  it("rejects invalid decimal values", () => {
    expect(isContractTotalGreaterThanInvoiceTotal("not-a-number", "250")).toBe(false);
    expect(isContractTotalGreaterThanInvoiceTotal("1000", "not-a-number")).toBe(false);
  });
});
