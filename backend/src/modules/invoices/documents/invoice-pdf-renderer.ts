import type { FinanceInvoice } from "../repositories/invoice.repository.js";

// Standard PDF Type-1 fonts use WinAnsiEncoding. Preserve French/Western European
// characters instead of stripping accents; unsupported glyphs are replaced safely.
const WIN_ANSI_SPECIAL: Record<string, number> = {
  "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86,
  "‡": 0x87, "ˆ": 0x88, "‰": 0x89, "Š": 0x8a, "‹": 0x8b, "Œ": 0x8c,
  "Ž": 0x8e, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95,
  "–": 0x96, "—": 0x97, "˜": 0x98, "™": 0x99, "š": 0x9a, "›": 0x9b,
  "œ": 0x9c, "ž": 0x9e, "Ÿ": 0x9f,
};
function winAnsi(value: unknown): string {
  let result = "";
  for (const character of String(value ?? "")) {
    const code = character.codePointAt(0) ?? 63;
    const mapped = WIN_ANSI_SPECIAL[character];
    if (mapped !== undefined) result += String.fromCharCode(mapped);
    else if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff)) result += String.fromCharCode(code);
    else if (character === "\n" || character === "\r" || character === "\t") result += " ";
    else result += "?";
  }
  return result.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}
function money(value: string, currency: string): string {
  return `${value} ${currency}`;
}
function wrap(value: unknown, width = 92): string[] {
  const text = String(value ?? "").trim();
  if (!text) return [];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (current && current.length + word.length + 1 > width) {
      lines.push(current);
      current = word;
    } else current = current ? `${current} ${word}` : word;
  }
  if (current) lines.push(current);
  return lines;
}
function makePdf(lines: string[]): Buffer {
  const pageLines: string[][] = [];
  let page: string[] = [];
  for (const line of lines) {
    if (page.length >= 48) { pageLines.push(page); page = []; }
    page.push(line);
  }
  if (page.length || pageLines.length === 0) pageLines.push(page);
  const objects: string[] = [];
  const addObject = (body: string) => { objects.push(body); return objects.length; };
  const catalogId = addObject("");
  const pagesId = addObject("");
  const fontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const pageIds: number[] = [];
  for (const pageContent of pageLines) {
    let stream = "BT\n/F1 10 Tf\n50 790 Td\n14 TL\n";
    for (const line of pageContent) stream += `(${winAnsi(line).slice(0, 125)}) Tj T*\n`;
    stream += "ET";
    const streamId = addObject(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
    const pageId = addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${streamId} 0 R >>`);
    pageIds.push(pageId);
  }
  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  let pdf = "%PDF-1.4\n%ZENOXFINANCE\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}
function addressLines(address: unknown): string[] {
  if (!address || typeof address !== "object") return [];
  const a = address as Record<string, unknown>;
  return [a["line1"], a["line2"], [a["postalCode"], a["city"]].filter(Boolean).join(" "), a["region"], a["countryCode"]]
    .filter((item) => item !== null && item !== undefined && String(item).trim() !== "")
    .map(String);
}

export function renderInvoicePdfDocument(invoice: FinanceInvoice, documentLabel = "FACTURE"): Buffer {
  if (invoice.status !== "ISSUED" || !invoice.invoiceCode || invoice.taxStatus !== "CALCULATED" || !invoice.taxSnapshotId) {
    throw new Error("INVOICE_PDF_REQUIRES_ISSUED_TAX_SNAPSHOTTED_INVOICE");
  }
  const seller = invoice.sellerSnapshot ?? {};
  const customer = invoice.customerSnapshot ?? {};
  const metadata = invoice.document ?? {};
  const sellerName = String(seller["tradeName"] || seller["legalName"] || "Émetteur");
  const customerName = String(customer["displayName"] || customer["legalName"] || "Client");
  const sellerAddress = addressLines(seller["address"]);
  const customerAddress = addressLines(customer["address"]);
  const lines = [
    sellerName,
    ...wrap(sellerAddress.join(", ")),
    ...wrap([seller["email"], seller["phone"], seller["website"]].filter(Boolean).join(" · ")),
    "",
    String(metadata["title"] || documentLabel),
    `N° : ${invoice.invoiceCode}`,
    `Date d’émission : ${invoice.issueDate ?? "-"} | Échéance : ${invoice.dueDate ?? "-"}`,
    ...(metadata["reference"] ? [`Référence : ${metadata["reference"]}`] : []),
    ...(metadata["purchaseOrderNumber"] ? [`Bon de commande : ${metadata["purchaseOrderNumber"]}`] : []),
    ...(metadata["contractReference"] ? [`Contrat : ${metadata["contractReference"]}`] : []),
    ...(metadata["globalDiscountPercent"] && metadata["globalDiscountPercent"] !== "0" ? [`Remise globale : ${metadata["globalDiscountPercent"]}%`] : []),
    ...(metadata["globalDiscountAmount"] && metadata["globalDiscountAmount"] !== "0" ? [`Remise globale : ${metadata["globalDiscountAmount"]} ${invoice.currencyCode}`] : []),
    "",
    "FACTURÉ À",
    customerName,
    ...wrap(customerAddress.join(", ")),
    ...wrap([customer["email"], customer["phone"]].filter(Boolean).join(" · ")),
    ...(customer["taxIdentifier"] ? [`Identifiant fiscal : ${customer["taxIdentifier"]}`] : []),
    "",
    "DÉTAIL DES BIENS ET PRESTATIONS",
    "Ligne | Désignation | Qté | Unité | Prix unitaire | Remise | Taxe | Total",
    "-".repeat(110),
    ...invoice.lines.flatMap((line) => [
      ...wrap(`${line.lineNumber}. ${line.description} ${line.itemCode ? `[${line.itemCode}]` : ""}`, 90),
      `${line.quantity} ${line.unit ?? ""} | ${line.unitPrice} | ${line.discountPercent}% | ${line.taxAmount} | ${line.total}`,
      ...(line.lineNote ? wrap(line.lineNote, 90) : []),
    ]),
    "-".repeat(110),
    `Sous-total : ${money(invoice.subtotal, invoice.currencyCode)}`,
    `Remises : ${money(invoice.discountTotal, invoice.currencyCode)}`,
    `Base taxable : ${money(invoice.taxableTotal, invoice.currencyCode)}`,
    `Taxes : ${money(invoice.taxTotal, invoice.currencyCode)}`,
    `NET À PAYER : ${money(invoice.amountDue, invoice.currencyCode)}`,
    "",
    ...(metadata["paymentTerms"] ? ["CONDITIONS DE RÈGLEMENT", ...wrap(metadata["paymentTerms"])] : []),
    ...(metadata["paymentMethod"] ? [`Moyen de paiement : ${metadata["paymentMethod"]}`] : []),
    ...(invoice.notes ? ["", "NOTES", ...wrap(invoice.notes)] : []),
    ...(metadata["footer"] ? ["", ...wrap(metadata["footer"])] : []),
    "",
    "Document émis et conservé dans le registre immuable ZENOX Finance.",
  ];
  return makePdf(lines);
}
