import { describe, expect, it } from "vitest";
import type { FinanceInvoice } from "../../src/modules/invoices/repositories/invoice.repository.js";
import { renderInvoiceHtmlDocument } from "../../src/modules/invoices/documents/invoice-html-renderer.js";
import { renderInvoicePdfDocument } from "../../src/modules/invoices/documents/invoice-pdf-renderer.js";

const invoice = {
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  customerId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  invoiceCode: "INV-2026-000123",
  status: "ISSUED",
  currencyCode: "XOF",
  currencyMinorUnit: 0,
  issueDate: "2026-10-16",
  dueDate: "2026-10-30",
  customerSnapshot: { legalName: "Client Exemple", countryCode: "BJ" },
  subtotal: "3000.00000000",
  discountTotal: "100.00000000",
  taxableTotal: "2900.00000000",
  taxTotal: "522.00000000",
  grandTotal: "3422.00000000",
  amountDue: "3422.0000",
  calculationPolicy: "LINE_HALF_UP_TAX_EXCLUSIVE_V1",
  notes: "Test multi-ligne",
  createdAt: "2026-10-16T10:00:00.000000Z",
  updatedAt: "2026-10-16T10:00:00.000000Z",
  documentVersion: 1,
  taxSnapshotId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  taxSnapshotVersion: 1,
  taxStatus: "CALCULATED",
  lines: [
    { id: "1", lineNumber: 1, description: "Transport maritime", quantity: "1", unitPrice: "1000", discountPercent: "0", taxRatePercent: "18", subtotal: "1000", discountAmount: "0", taxableAmount: "1000", taxAmount: "180", total: "1180" },
    { id: "2", lineNumber: 2, description: "Manutention", quantity: "2", unitPrice: "1000", discountPercent: "5", taxRatePercent: "18", subtotal: "2000", discountAmount: "100", taxableAmount: "1900", taxAmount: "342", total: "2242" },
  ],
} as unknown as FinanceInvoice;

describe("invoice document rendering", () => {
  it("renders every invoice line in order and escapes customer-provided text", () => {
    const html = renderInvoiceHtmlDocument({
      invoice: { ...invoice, lines: [...invoice.lines, { ...invoice.lines[0]!, id: "3", lineNumber: 3, description: "<script>alert(1)</script>" }] },
      appliedRules: [{ ruleCode: "VAT18", treatment: "STANDARD", ratePercent: "18" }],
      taxResult: { taxTotal: "522" },
    });
    expect(html.indexOf("Transport maritime")).toBeLessThan(html.indexOf("Manutention"));
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect((html.match(/<tr>/g) ?? []).length).toBe(3);
    expect(html).toContain("3422.00000000");
  });

  it("creates a valid PDF header and includes every line and total across its pages", () => {
    const pdf = renderInvoicePdfDocument(invoice);
    expect(pdf.subarray(0, 8).toString("ascii")).toBe("%PDF-1.4");
    const output = pdf.toString("ascii");
    expect(output).toContain("Transport maritime");
    expect(output).toContain("Manutention");
    expect(output).toContain("TOTAL BRUT");
    expect(output).toContain("NET A PAYER");
    expect(output).toContain("startxref");
    expect(output).toContain("%%EOF");
  });

  it("rejects PDF rendering of a draft or a missing tax snapshot", () => {
    expect(() => renderInvoicePdfDocument({ ...invoice, status: "DRAFT" })).toThrow("INVOICE_PDF_REQUIRES_ISSUED_TAX_SNAPSHOTTED_INVOICE");
    expect(() => renderInvoicePdfDocument({ ...invoice, taxSnapshotId: null })).toThrow("INVOICE_PDF_REQUIRES_ISSUED_TAX_SNAPSHOTTED_INVOICE");
  });
});
