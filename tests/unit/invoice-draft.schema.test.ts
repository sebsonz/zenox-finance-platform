import { describe, expect, it } from "vitest";
import { createInvoiceDraftSchema, listInvoiceDraftsQuerySchema } from "../../src/modules/invoices/validators/invoice-draft.schema.js";

const customerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("invoice draft request schema", () => {
  it("accepts a valid draft request and defaults the discount to zero", () => {
    const parsed = createInvoiceDraftSchema.parse({
      customerId,
      currencyCode: "xof",
      lines: [{ description: "Transport maritime", quantity: "2", unitPrice: "15000", taxRatePercent: "18" }],
    });
    expect(parsed.currencyCode).toBe("XOF");
    expect(parsed.lines[0]?.discountPercent).toBe("0");
  });

  it("accepts a multi-line invoice up to the documented 500-line limit", () => {
    const parsed = createInvoiceDraftSchema.parse({
      customerId,
      currencyCode: "XOF",
      lines: [
        { description: "Transport maritime", quantity: "2", unitPrice: "15000", taxRatePercent: "18" },
        { description: "Manutention", quantity: "1", unitPrice: "5000", discountPercent: "10", taxRatePercent: "18" },
        { description: "Frais de dossier", quantity: "1", unitPrice: "2500", taxRatePercent: "0" },
      ],
    });
    expect(parsed.lines).toHaveLength(3);
    expect(parsed.lines.map((line) => line.description)).toEqual([
      "Transport maritime", "Manutention", "Frais de dossier",
    ]);
    expect(parsed.lines[1]?.discountPercent).toBe("10");
  });

  it("rejects client-supplied totals or unknown fields", () => {
    const result = createInvoiceDraftSchema.safeParse({
      customerId,
      currencyCode: "XOF",
      grandTotal: "1",
      lines: [{ description: "Service", quantity: "1", unitPrice: "10", taxRatePercent: "0" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-decimal, negative, exponent and empty line amounts at the schema boundary", () => {
    for (const value of ["-1", "1e3", ".5", "01", ""]) {
      const result = createInvoiceDraftSchema.safeParse({
        customerId, currencyCode: "XOF",
        lines: [{ description: "Service", quantity: value, unitPrice: "10", taxRatePercent: "0" }],
      });
      expect(result.success).toBe(false);
    }
  });

  it("limits line count and rejects unknown list query fields", () => {
    const tooMany = createInvoiceDraftSchema.safeParse({
      customerId, currencyCode: "XOF",
      lines: Array.from({ length: 501 }, () => ({ description: "Service", quantity: "1", unitPrice: "1", taxRatePercent: "0" })),
    });
    expect(tooMany.success).toBe(false);
    expect(listInvoiceDraftsQuerySchema.safeParse({ limit: "25", unexpected: "true" }).success).toBe(false);
  });
});
