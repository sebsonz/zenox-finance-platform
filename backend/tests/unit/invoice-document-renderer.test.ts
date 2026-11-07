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
  issuerSnapshot: { legalName: "Société Émettrice", tradeName: "ZENOX Transport", address: "Rue du Port", city: "Cotonou", countryCode: "BJ", email: "facturation@example.com" },
  customerSnapshot: { legalName: "Client Exemple", address: "Quartier Haie Vive", city: "Cotonou", postalCode: "01 BP 100", countryCode: "BJ" },
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
    const tbody = html.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? "";
    expect((tbody.match(/<tr>/g) ?? []).length).toBe(3);
    expect(html).toContain("3422.00000000");
    expect(html).toContain("ZENOX Transport");
    expect(html).toContain("Société Émettrice");
    expect(html).toContain("Rue du Port");
    expect(html).toContain("Quartier Haie Vive");
    expect(html).not.toContain(invoice.id);
    expect(html).not.toContain(invoice.taxSnapshotId!);
    expect(html).not.toContain("Données de calcul");
    expect(html).not.toContain("Règles fiscales appliquées");
  });

  it("renders professional payment terms and references as escaped customer-facing content", () => {
    const html = renderInvoiceHtmlDocument({
      invoice: {
        ...invoice,
        purchaseOrderReference: "BC-2026-0042",
        serviceDate: "2026-11-05",
        paymentTerms: "Paiement à 14 jours",
        paymentInstructions: "Virement ou Mobile Money",
        externalReference: "<REF-CLIENT>",
        footerNote: "Merci de votre confiance.",
      },
      appliedRules: [],
      taxResult: {},
    });
    expect(html).toContain("BC-2026-0042");
    expect(html).toContain("Paiement à 14 jours");
    expect(html).toContain("Virement ou Mobile Money");
    expect(html).toContain("&lt;REF-CLIENT&gt;");
    expect(html).not.toContain("<REF-CLIENT>");
    expect(html).toContain("Merci de votre confiance.");
    expect(html).not.toContain(invoice.id);
    expect(html).not.toContain(invoice.taxSnapshotId!);
  });

  it("labels deposit and balance documents distinctly in customer-facing HTML", () => {
    const depositHtml = renderInvoiceHtmlDocument({
      invoice: { ...invoice, documentType: "DEPOSIT", contractTotal: "10000", relatedInvoiceId: null },
      appliedRules: [], taxResult: {},
    });
    const balanceHtml = renderInvoiceHtmlDocument({
      invoice: { ...invoice, documentType: "BALANCE", contractTotal: null, relatedInvoiceId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
      appliedRules: [], taxResult: {},
    });
    expect(depositHtml).toContain("FACTURE D’ACOMPTE");
    expect(depositHtml).toContain("Montant total du contrat : 10000 XOF");
    expect(balanceHtml).toContain("FACTURE DE SOLDE");
    expect(balanceHtml).toContain("Facture d’acompte source");
  });

  it("creates a valid Unicode PDF with embedded fonts", async () => {
    const pdf = await renderInvoicePdfDocument(invoice);
    expect(pdf.subarray(0, 8).toString("ascii")).toBe("%PDF-1.4");
    const output = pdf.toString("latin1");
    expect(output).not.toContain(invoice.id);
    expect(output).not.toContain(invoice.taxSnapshotId!);
    expect(output).not.toContain("Test multi-ligne");
    expect(output).toContain("/FontFile2");
    expect(output).toContain("/ToUnicode");
    expect(output).toContain("startxref");
    expect(output).toContain("%%EOF");
  });

  it("paginates long Unicode descriptions without clipping the invoice", async () => {
    const longDescription = "Équipement logistique – manutention, vérification et livraison à Cotonou. ".repeat(35);
    const manyLines = Array.from({ length: 75 }, (_, index) => ({
      ...invoice.lines[0]!,
      id: String(index + 1),
      lineNumber: index + 1,
      description: `${index + 1}. ${longDescription}`,
    }));
    const pdf = await renderInvoicePdfDocument({ ...invoice, lines: manyLines });
    const output = pdf.toString("latin1");
    const pageCount = (output.match(/\/Type \/Page\b/g) ?? []).length;

    expect(pageCount).toBeGreaterThan(1);
    expect(output).toContain("/FontFile2");
    expect(output).toContain("/ToUnicode");
  });

  it("rejects PDF rendering of a draft or a missing tax snapshot", async () => {
    await expect(renderInvoicePdfDocument({ ...invoice, status: "DRAFT" })).rejects.toThrow("INVOICE_PDF_REQUIRES_ISSUED_TAX_SNAPSHOTTED_INVOICE");
    await expect(renderInvoicePdfDocument({ ...invoice, taxSnapshotId: null })).rejects.toThrow("INVOICE_PDF_REQUIRES_ISSUED_TAX_SNAPSHOTTED_INVOICE");
  });
});
