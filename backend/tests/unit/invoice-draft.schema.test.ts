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

  it("defaults existing drafts to standard invoices", () => {
    const parsed = createInvoiceDraftSchema.parse({
      customerId, currencyCode: "XOF",
      lines: [{ description: "Service", quantity: "1", unitPrice: "100", taxRatePercent: "0" }],
    });
    expect(parsed.documentType).toBe("STANDARD");
  });

  it("requires a contract total greater than the deposit invoice amount", () => {
    const base = { customerId, currencyCode: "XOF", lines: [{ description: "Acompte", quantity: "1", unitPrice: "250", taxRatePercent: "0" }] };
    expect(createInvoiceDraftSchema.safeParse({ ...base, documentType: "DEPOSIT", contractTotal: "1000" }).success).toBe(true);
    expect(createInvoiceDraftSchema.safeParse({ ...base, documentType: "DEPOSIT" }).success).toBe(false);
    expect(createInvoiceDraftSchema.safeParse({ ...base, documentType: "DEPOSIT", contractTotal: "100" }).success).toBe(false);
  });

  it("requires a source deposit invoice for balance invoices", () => {
    const base = { customerId, currencyCode: "XOF", lines: [{ description: "Solde", quantity: "1", unitPrice: "750", taxRatePercent: "0" }] };
    expect(createInvoiceDraftSchema.safeParse({ ...base, documentType: "BALANCE", relatedInvoiceId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }).success).toBe(true);
    expect(createInvoiceDraftSchema.safeParse({ ...base, documentType: "BALANCE" }).success).toBe(false);
  });

  it("rejects incompatible document-type metadata", () => {
    const base = { customerId, currencyCode: "XOF", lines: [{ description: "Service", quantity: "1", unitPrice: "100", taxRatePercent: "0" }] };
    expect(createInvoiceDraftSchema.safeParse({ ...base, documentType: "STANDARD", contractTotal: "1000" }).success).toBe(false);
    expect(createInvoiceDraftSchema.safeParse({ ...base, documentType: "DEPOSIT", contractTotal: "1000", relatedInvoiceId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }).success).toBe(false);
    expect(createInvoiceDraftSchema.safeParse({ ...base, documentType: "BALANCE", relatedInvoiceId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", contractTotal: "1000" }).success).toBe(false);
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

  it("accepts professional invoice references, service date and payment instructions", () => {
    const parsed = createInvoiceDraftSchema.parse({
      customerId,
      currencyCode: "XOF",
      purchaseOrderReference: "BC-2026-0042",
      serviceDate: "2026-11-05",
      paymentTerms: "Paiement à 14 jours",
      paymentInstructions: "Virement bancaire ou Mobile Money",
      externalReference: "CLIENT-REF-88",
      footerNote: "Merci de votre confiance.",
      lines: [{ description: "Transport maritime", quantity: "1", unitPrice: "15000", taxRatePercent: "18" }],
    });
    expect(parsed).toMatchObject({
      purchaseOrderReference: "BC-2026-0042",
      serviceDate: "2026-11-05",
      paymentTerms: "Paiement à 14 jours",
      paymentInstructions: "Virement bancaire ou Mobile Money",
      externalReference: "CLIENT-REF-88",
      footerNote: "Merci de votre confiance.",
    });
  });

  it("rejects professional invoice metadata beyond database limits", () => {
    const base = {
      customerId,
      currencyCode: "XOF",
      lines: [{ description: "Service", quantity: "1", unitPrice: "10", taxRatePercent: "0" }],
    };
    expect(createInvoiceDraftSchema.safeParse({ ...base, purchaseOrderReference: "x".repeat(121) }).success).toBe(false);
    expect(createInvoiceDraftSchema.safeParse({ ...base, paymentTerms: "x".repeat(501) }).success).toBe(false);
    expect(createInvoiceDraftSchema.safeParse({ ...base, paymentInstructions: "x".repeat(2001) }).success).toBe(false);
    expect(createInvoiceDraftSchema.safeParse({ ...base, footerNote: "x".repeat(1001) }).success).toBe(false);
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

  it("aligns money and percentage precision with PostgreSQL numeric columns", () => {
    const base = {
      customerId,
      currencyCode: "XOF",
      lines: [{ description: "Service", quantity: "1", unitPrice: "10", taxRatePercent: "0" }],
    };

    expect(createInvoiceDraftSchema.safeParse({
      ...base,
      lines: [{ ...base.lines[0], quantity: "1.12345678", unitPrice: "10", taxRatePercent: "0" }],
    }).success).toBe(true);

    for (const invalidQuantity of ["1.123456789", "10000000000000000"]) {
      expect(createInvoiceDraftSchema.safeParse({
        ...base,
        lines: [{ ...base.lines[0], quantity: invalidQuantity, unitPrice: "10", taxRatePercent: "0" }],
      }).success).toBe(false);
    }

    for (const invalidRate of ["18.1234567", "1000"]) {
      expect(createInvoiceDraftSchema.safeParse({
        ...base,
        lines: [{ ...base.lines[0], quantity: "1", unitPrice: "10", taxRatePercent: invalidRate }],
      }).success).toBe(false);
    }
  });

  it("accepts bounded server-side invoice search and status filters", () => {
    expect(listInvoiceDraftsQuerySchema.parse({ search: "  CLIENT-REF-88  ", status: "ISSUED" })).toMatchObject({
      search: "CLIENT-REF-88",
      status: "ISSUED",
      limit: 25,
    });
    expect(listInvoiceDraftsQuerySchema.safeParse({ search: " " }).success).toBe(false);
    expect(listInvoiceDraftsQuerySchema.safeParse({ search: "x".repeat(121) }).success).toBe(false);
    expect(listInvoiceDraftsQuerySchema.safeParse({ status: "PAID" }).success).toBe(false);
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
