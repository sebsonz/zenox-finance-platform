import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import type { FinanceInvoice } from "../repositories/invoice.repository.js";

const require = createRequire(import.meta.url);

interface PdfStream {
  on(event: "data", listener: (chunk: Buffer | Uint8Array) => void): this;
  on(event: "end", listener: () => void): this;
  on(event: "error", listener: (error: Error) => void): this;
  end(): void;
}

interface PdfPrinterInstance {
  createPdfKitDocument(definition: Record<string, unknown>, options?: Record<string, unknown>): PdfStream;
}

type FontSet = Record<string, { normal: string; bold: string; italics: string; bolditalics: string }>;

let cachedRobotoFonts: FontSet | undefined;

function resolveRobotoFonts(): FontSet {
  if (cachedRobotoFonts) return cachedRobotoFonts;

  const packageEntry = require.resolve("pdfmake");
  const packageRoot = resolve(dirname(packageEntry), "..");
  const fontNames = ["Roboto-Regular.ttf", "Roboto-Medium.ttf", "Roboto-Italic.ttf", "Roboto-MediumItalic.ttf"];
  const fontDirectories = [
    resolve(packageRoot, "build/fonts/Roboto"),
    resolve(packageRoot, "fonts/Roboto"),
    resolve(packageRoot, "examples/fonts/Roboto"),
  ];
  let fontPaths = fontNames.map((name) => {
    const directory = fontDirectories.find((candidate) => existsSync(resolve(candidate, name)));
    return directory ? resolve(directory, name) : "";
  });

  if (fontPaths.some((fontPath) => !fontPath)) {
    // The npm distribution commonly ships Roboto inside pdfmake's virtual font
    // bundle rather than as standalone TTF files. Extract those bundled assets
    // to a private temporary directory so PDFKit can embed them normally.
    const vfsPath = require.resolve("pdfmake/build/vfs_fonts.js");
    const virtualFontModule = require(vfsPath) as {
      pdfMake?: { vfs?: Record<string, string> };
      vfs?: Record<string, string>;
      [fontName: string]: unknown;
    };
    const vfs = (virtualFontModule.pdfMake?.vfs ?? virtualFontModule.vfs ?? virtualFontModule) as Record<string, string>;
    if (!vfs) throw new Error("INVOICE_PDF_ROBOTO_VIRTUAL_FONTS_NOT_FOUND");

    const fontDirectory = mkdtempSync(join(tmpdir(), "zenox-finance-pdf-fonts-"));
    fontPaths = fontNames.map((name) => {
      const encoded = vfs[name];
      if (!encoded) throw new Error(`INVOICE_PDF_ROBOTO_FONT_MISSING:${name}`);
      const fontPath = resolve(fontDirectory, name);
      writeFileSync(fontPath, Buffer.from(encoded, "base64"), { flag: "wx" });
      return fontPath;
    });
  }

  cachedRobotoFonts = {
    Roboto: {
      normal: fontPaths[0]!,
      bold: fontPaths[1]!,
      italics: fontPaths[2]!,
      bolditalics: fontPaths[3]!,
    },
  };
  return cachedRobotoFonts;
}

function text(value: unknown, fallback = "—"): string {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function money(value: string, currency: string): string {
  return `${value} ${currency}`;
}

function partyLines(snapshot: Record<string, unknown>): string[] {
  return [
    text(snapshot["address"], ""),
    text(snapshot["addressLine2"], ""),
    [text(snapshot["postalCode"], ""), text(snapshot["city"], "")].filter(Boolean).join(" "),
    text(snapshot["region"], ""),
    text(snapshot["countryCode"], ""),
    text(snapshot["email"], ""),
    text(snapshot["phone"], ""),
    snapshot["taxIdentifier"] ? `Identifiant fiscal : ${text(snapshot["taxIdentifier"])}` : "",
    snapshot["registrationIdentifier"] ? `Identifiant légal : ${text(snapshot["registrationIdentifier"])}` : "",
    text(snapshot["websiteUrl"], ""),
  ].filter(Boolean);
}

function renderPdf(definition: Record<string, unknown>): Promise<Buffer> {
  const PdfPrinter = require("pdfmake") as new (fonts: FontSet) => PdfPrinterInstance;
  const printer = new PdfPrinter(resolveRobotoFonts());
  const document = printer.createPdfKitDocument(definition, { compress: false });

  return new Promise((resolveBuffer, reject) => {
    const chunks: Buffer[] = [];
    document.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    document.on("end", () => resolveBuffer(Buffer.concat(chunks)));
    document.on("error", reject);
    document.end();
  });
}

export async function renderInvoicePdfDocument(invoice: FinanceInvoice, documentLabel = "FACTURE"): Promise<Buffer> {
  if (invoice.status !== "ISSUED" || !invoice.invoiceCode || invoice.taxStatus !== "CALCULATED" || !invoice.taxSnapshotId) {
    throw new Error("INVOICE_PDF_REQUIRES_ISSUED_TAX_SNAPSHOTTED_INVOICE");
  }

  const issuer = invoice.issuerSnapshot;
  const customer = invoice.customerSnapshot;
  const issuerName = text(issuer["tradeName"] ?? issuer["legalName"], "ZENOX Finance");
  const issuerDetails = partyLines(issuer);
  const customerName = text(customer["legalName"] ?? customer["displayName"]);
  const customerDetails = partyLines(customer);
  const rows = invoice.lines.map((line) => [
    { text: String(line.lineNumber), alignment: "center" },
    { text: text(line.description), style: "description" },
    { text: String(line.quantity), alignment: "right" },
    { text: String(line.unitPrice), alignment: "right" },
    { text: String(line.discountAmount), alignment: "right" },
    { text: String(line.taxAmount), alignment: "right" },
    { text: String(line.total), alignment: "right", bold: true },
  ]);

  const totals = [
    ["Sous-total", money(invoice.subtotal, invoice.currencyCode)],
    ["Remises", money(invoice.discountTotal, invoice.currencyCode)],
    ["Base taxable", money(invoice.taxableTotal, invoice.currencyCode)],
    ["Taxes", money(invoice.taxTotal, invoice.currencyCode)],
    [
      documentLabel === "AVOIR" ? "Total de l’avoir" : "Total brut",
      money(invoice.grandTotal, invoice.currencyCode),
    ],
    [
      documentLabel === "AVOIR" ? "Montant à créditer" : "Net à payer",
      money(invoice.amountDue, invoice.currencyCode),
    ],
  ];

  const content: unknown[] = [
    {
      columns: [
        {
          width: "*",
          stack: [
            { text: issuerName, style: "brand" },
            ...issuerDetails.map((detail) => ({ text: detail, style: "muted" })),
            { text: documentLabel, style: "documentTitle", margin: [0, 5, 0, 0] },
          ],
        },
        {
          width: "auto",
          alignment: "right",
          stack: [
            { text: invoice.invoiceCode, style: "documentNumber" },
            { text: `Date d’émission : ${text(invoice.issueDate)}`, style: "muted" },
            { text: `Échéance : ${text(invoice.dueDate)}`, style: "muted" },
            ...(invoice.purchaseOrderReference ? [{ text: `Commande : ${invoice.purchaseOrderReference}`, style: "muted" }] : []),
            ...(invoice.externalReference ? [{ text: `Référence : ${invoice.externalReference}`, style: "muted" }] : []),
            ...(invoice.serviceDate ? [{ text: `Prestation / livraison : ${invoice.serviceDate}`, style: "muted" }] : []),
          ],
        },
      ],
      columnGap: 20,
      margin: [0, 0, 0, 18],
    },
    {
      columns: [
        {
          width: "*",
          stack: [
            { text: "FACTURÉ À", style: "sectionLabel" },
            { text: customerName, style: "partyName" },
            ...customerDetails.map((detail) => ({ text: detail, style: "partyDetail" })),
          ],
          style: "partyPanel",
        },
        {
          width: "*",
          stack: [
            { text: "INFORMATIONS DE FACTURATION", style: "sectionLabel" },
            { text: `Devise : ${invoice.currencyCode}`, style: "partyDetail" },
            ...(invoice.paymentTerms ? [{ text: `Conditions : ${invoice.paymentTerms}`, style: "partyDetail" }] : []),
          ],
          style: "partyPanel",
        },
      ],
      columnGap: 14,
      margin: [0, 0, 0, 22],
    },
    { text: "DÉTAIL DES PRESTATIONS", style: "sectionTitle" },
    {
      table: {
        headerRows: 1,
        keepWithHeaderRows: 1,
        dontBreakRows: true,
        widths: [22, "*", 34, 61, 48, 48, 61],
        body: [
          [
            { text: "#", style: "tableHeader", alignment: "center" },
            { text: "Description", style: "tableHeader" },
            { text: "Qté", style: "tableHeader", alignment: "right" },
            { text: "Prix unitaire", style: "tableHeader", alignment: "right" },
            { text: "Remise", style: "tableHeader", alignment: "right" },
            { text: "Taxe", style: "tableHeader", alignment: "right" },
            { text: "Total", style: "tableHeader", alignment: "right" },
          ],
          ...rows,
        ],
      },
      layout: {
        fillColor: (rowIndex: number) => rowIndex === 0 ? "#EEF1F5" : rowIndex % 2 === 0 ? "#F8F9FB" : null,
        hLineColor: () => "#D9DEE7",
        vLineColor: () => "#FFFFFF",
        hLineWidth: (rowIndex: number) => rowIndex === 0 ? 0 : 0.5,
        paddingLeft: () => 5,
        paddingRight: () => 5,
        paddingTop: () => 7,
        paddingBottom: () => 7,
      },
    },
    {
      unbreakable: true,
      margin: [0, 18, 0, 0],
      stack: [
        {
          columns: [
            { width: "*", text: "" },
            {
              width: 245,
              table: {
                widths: ["*", "auto"],
                body: totals.map(([label, value], index) => [
                  { text: label, style: index >= 4 ? "totalStrong" : "totalLabel" },
                  { text: value, style: index >= 4 ? "totalStrong" : "totalValue", alignment: "right" },
                ]),
              },
              layout: {
                hLineColor: (index: number) => index === 4 ? "#172033" : "#FFFFFF",
                hLineWidth: (index: number) => index === 4 ? 1.5 : 0,
                vLineWidth: () => 0,
                paddingLeft: () => 4,
                paddingRight: () => 4,
                paddingTop: () => 6,
                paddingBottom: () => 6,
              },
            },
          ],
        },
        ...(invoice.paymentInstructions ? [{
          text: [
            { text: "MODALITÉS DE PAIEMENT\n", bold: true },
            invoice.paymentInstructions,
          ],
          style: "payment",
          margin: [0, 18, 0, 0],
        }] : []),
        ...(invoice.footerNote ? [{ text: invoice.footerNote, style: "footerNote", margin: [0, 12, 0, 0] }] : []),
      ],
    },
  ];

  const definition: Record<string, unknown> = {
    pageSize: "A4",
    version: "1.4",
    pageMargins: [40, 64, 40, 52],
    info: {
      title: `${documentLabel} ${invoice.invoiceCode}`,
      subject: "Document commercial ZENOX Finance",
      creator: "ZENOX Finance",
    },
    header: () => ({
      canvas: [{ type: "line", x1: 40, y1: 44, x2: 555, y2: 44, lineWidth: 0.7, lineColor: "#D9DEE7" }],
    }),
    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        { text: "ZENOX Finance · Document confidentiel", style: "pageFooter" },
        { text: `Page ${currentPage} / ${pageCount}`, alignment: "right", style: "pageFooter" },
      ],
      margin: [40, 14, 40, 0],
    }),
    content,
    defaultStyle: { font: "Roboto", fontSize: 8.5, color: "#172033", lineHeight: 1.25 },
    styles: {
      brand: { fontSize: 10, bold: true, color: "#344054", characterSpacing: 1.1, margin: [0, 0, 0, 5] },
      documentTitle: { fontSize: 22, bold: true, color: "#172033" },
      documentNumber: { fontSize: 13, bold: true, color: "#172033", margin: [0, 0, 0, 4] },
      muted: { fontSize: 8, color: "#667085", margin: [0, 2, 0, 0] },
      sectionLabel: { fontSize: 7.5, bold: true, color: "#667085", characterSpacing: 0.5, margin: [0, 0, 0, 7] },
      partyName: { fontSize: 10, bold: true, margin: [0, 0, 0, 4] },
      partyDetail: { fontSize: 8, color: "#475467", margin: [0, 1, 0, 1] },
      partyPanel: { fillColor: "#F8F9FB", margin: [10, 12, 10, 12] },
      sectionTitle: { fontSize: 10, bold: true, color: "#172033", margin: [0, 0, 0, 9] },
      tableHeader: { fontSize: 7, bold: true, color: "#344054" },
      description: { fontSize: 8, lineHeight: 1.25 },
      totalLabel: { fontSize: 8, color: "#475467" },
      totalValue: { fontSize: 8, color: "#172033" },
      totalStrong: { fontSize: 9, bold: true, color: "#172033" },
      payment: { fontSize: 8, color: "#475467", fillColor: "#F8F9FB", margin: [10, 10, 10, 10] },
      footerNote: { fontSize: 8, color: "#667085", italics: true },
      pageFooter: { fontSize: 7, color: "#98A2B3" },
    },
  };

  return renderPdf(definition);
}
