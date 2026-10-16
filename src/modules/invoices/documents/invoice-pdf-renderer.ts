import type { FinanceInvoice } from "../repositories/invoice.repository.js";

function plainText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "?")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function money(value: string, currency: string): string {
  return `${value} ${currency}`;
}

function makePdf(lines: string[]): Buffer {
  const pageLines: string[][] = [];
  let page: string[] = [];
  for (const line of lines) {
    if (page.length >= 48) {
      pageLines.push(page);
      page = [];
    }
    page.push(line);
  }
  if (page.length || pageLines.length === 0) pageLines.push(page);

  const objects: string[] = [];
  const addObject = (body: string) => { objects.push(body); return objects.length; };
  const catalogId = addObject("");
  const pagesId = addObject("");
  const fontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pageIds: number[] = [];

  for (const pageContent of pageLines) {
    let stream = "BT\n/F1 10 Tf\n50 790 Td\n14 TL\n";
    for (const line of pageContent) stream += `(${plainText(line).slice(0, 110)}) Tj T*\n`;
    stream += "ET";
    const streamId = addObject(`<< /Length ${Buffer.byteLength(stream, "ascii")} >>\nstream\n${stream}\nendstream`);
    const pageId = addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${streamId} 0 R >>`);
    pageIds.push(pageId);
  }
  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

  let pdf = "%PDF-1.4\n%ZENOXFINANCE\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "ascii"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, "ascii");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "ascii");
}

export function renderInvoicePdfDocument(invoice: FinanceInvoice, documentLabel = "FACTURE"): Buffer {
  if (invoice.status !== "ISSUED" || !invoice.invoiceCode || invoice.taxStatus !== "CALCULATED" || !invoice.taxSnapshotId) {
    throw new Error("INVOICE_PDF_REQUIRES_ISSUED_TAX_SNAPSHOTTED_INVOICE");
  }
  const customer = invoice.customerSnapshot;
  const lines = [
    "ZENOX FINANCE",
    plainText(documentLabel),
    `Numero: ${invoice.invoiceCode}`,
    `Date emission: ${invoice.issueDate ?? "-"} | Echeance: ${invoice.dueDate ?? "-"}`,
    `Client: ${String(customer["legalName"] ?? customer["displayName"] ?? "-")}`,
    `Pays: ${String(customer["countryCode"] ?? "-")} | Identifiant fiscal: ${String(customer["taxIdentifier"] ?? "-")}`,
    `Devise: ${invoice.currencyCode} | Revision: ${invoice.documentVersion}`,
    `Snapshot fiscal: ${invoice.taxSnapshotId}`,
    "",
    "DETAIL DES PRESTATIONS",
    "Ligne | Description | Qte | Prix unitaire | Remise | Taxe | Total",
    "-".repeat(105),
    ...invoice.lines.map((line) =>
      `${line.lineNumber} | ${line.description} | ${line.quantity} | ${line.unitPrice} | ${line.discountAmount} | ${line.taxAmount} | ${line.total}`
    ),
    "-".repeat(105),
    `Sous-total: ${money(invoice.subtotal, invoice.currencyCode)}`,
    `Remises: ${money(invoice.discountTotal, invoice.currencyCode)}`,
    `Base taxable: ${money(invoice.taxableTotal, invoice.currencyCode)}`,
    `Taxes: ${money(invoice.taxTotal, invoice.currencyCode)}`,
    `${documentLabel === "AVOIR" ? "TOTAL A CREDITer" : "TOTAL BRUT"}: ${money(invoice.grandTotal, invoice.currencyCode)}`,
    `${documentLabel === "AVOIR" ? "MONTANT A CREDITer" : "NET A PAYER"}: ${money(invoice.amountDue, invoice.currencyCode)}`,
    "",
    `Notes: ${invoice.notes ?? "-"}`,
    "Document genere par ZENOX Finance. Validation legale et fiscale par juridiction requise.",
  ];
  return makePdf(lines);
}
