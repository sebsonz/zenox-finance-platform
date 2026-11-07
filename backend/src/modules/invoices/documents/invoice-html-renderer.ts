import type { FinanceInvoice } from "../repositories/invoice.repository.js";

export interface InvoiceHtmlDocumentInput {
  invoice: FinanceInvoice;
  appliedRules: readonly Record<string, unknown>[];
  taxResult: Record<string, unknown>;
  documentLabel?: string;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    const replacements: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return replacements[character]!;
  });
}

function customerValue(snapshot: Record<string, unknown>, key: string): string {
  return String(snapshot[key] ?? "");
}

export function renderInvoiceHtmlDocument(input: InvoiceHtmlDocumentInput): string {
  const { invoice, documentLabel = "FACTURE" } = input;
  if (invoice.status !== "ISSUED" || !invoice.invoiceCode || invoice.taxStatus !== "CALCULATED" || !invoice.taxSnapshotId) {
    throw new Error("INVOICE_DOCUMENT_REQUIRES_ISSUED_TAX_SNAPSHOTTED_INVOICE");
  }

  const lines = invoice.lines.map((line) => `
    <tr>
      <td>${escapeHtml(line.lineNumber)}</td>
      <td class="description">${escapeHtml(line.description)}</td>
      <td class="number">${escapeHtml(line.quantity)}</td>
      <td class="number">${escapeHtml(line.unitPrice)}</td>
      <td class="number">${escapeHtml(line.discountAmount)}</td>
      <td class="number">${escapeHtml(line.taxAmount)}</td>
      <td class="number">${escapeHtml(line.total)}</td>
    </tr>`).join("");

  const issuer = invoice.issuerSnapshot ?? {};
  const customer = invoice.customerSnapshot;
  const issuerName = customerValue(issuer, "tradeName") || customerValue(issuer, "legalName") || "ZENOX Finance";
  const issuerLegalName = customerValue(issuer, "legalName");
  const issuerLegalNameLine = issuerLegalName && issuerLegalName !== issuerName
    ? `<div>${escapeHtml(issuerLegalName)}</div>` : "";
  const customerName = customerValue(customer, "legalName") || customerValue(customer, "displayName");
  const partyDetails = (snapshot: Record<string, unknown>) => [
    customerValue(snapshot, "address"), customerValue(snapshot, "addressLine2"),
    [customerValue(snapshot, "postalCode"), customerValue(snapshot, "city")].filter(Boolean).join(" "),
    customerValue(snapshot, "region"), customerValue(snapshot, "countryCode"),
    customerValue(snapshot, "email"), customerValue(snapshot, "phone"),
    customerValue(snapshot, "taxIdentifier") ? `Identifiant fiscal : ${customerValue(snapshot, "taxIdentifier")}` : "",
    customerValue(snapshot, "registrationIdentifier") ? `Identifiant légal : ${customerValue(snapshot, "registrationIdentifier")}` : "",
    customerValue(snapshot, "websiteUrl"),
  ].filter(Boolean).map((value) => `<div>${escapeHtml(value)}</div>`).join("");
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(documentLabel)} ${escapeHtml(invoice.invoiceCode)}</title>
<style>
  :root { color-scheme: light; font-family: Arial, Helvetica, sans-serif; color: #172033; background: #fff; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 32px; background: #fff; font-size: 14px; line-height: 1.45; }
  main { max-width: 1000px; margin: 0 auto; }
  header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; border-bottom: 2px solid #172033; padding-bottom: 20px; }
  h1 { font-size: 28px; line-height: 1.15; margin: 0 0 8px; letter-spacing: .02em; }
  h2 { font-size: 16px; margin: 0 0 12px; }
  .muted { color: #5a6475; }
  .document-meta { text-align: right; min-width: 220px; }
  .document-number { font-size: 18px; font-weight: 700; }
  .columns { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 24px; }
  .panel { border: 1px solid #d7dce4; border-radius: 8px; padding: 16px; min-width: 0; overflow-wrap: anywhere; }
  .party-name { font-weight: 700; margin-bottom: 6px; }
  .party-details { color: #5a6475; line-height: 1.6; }
  .section-title { margin-top: 28px; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th, td { border-bottom: 1px solid #d7dce4; padding: 10px 8px; text-align: left; vertical-align: top; }
  th { background: #f3f5f8; font-size: 12px; font-weight: 700; }
  .number { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .description { min-width: 180px; overflow-wrap: anywhere; }
  .totals { width: min(100%, 420px); margin: 20px 0 0 auto; }
  .totals td { border: 0; padding: 7px 0; }
  .grand { font-weight: 700; font-size: 18px; border-top: 2px solid #172033 !important; }
  .payment { margin-top: 28px; padding: 16px; border: 1px solid #d7dce4; border-radius: 8px; }
  .payment p { margin: 6px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; }
  footer { margin-top: 28px; border-top: 1px solid #d7dce4; padding-top: 12px; font-size: 11px; color: #5a6475; white-space: pre-wrap; overflow-wrap: anywhere; }
  @page { size: A4; margin: 16mm 14mm; }
  @media print {
    body { padding: 0; font-size: 10pt; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    main { max-width: none; }
    header, .panel, .payment, .totals { break-inside: avoid; }
    thead { display: table-header-group; }
    tfoot { display: table-footer-group; }
    tr { break-inside: avoid; }
    h2 { break-after: avoid; }
    footer { break-inside: avoid; }
  }
  @media (max-width: 640px) {
    body { padding: 14px; }
    header, .columns { display: block; }
    .document-meta { text-align: left; margin-top: 16px; }
    .panel { margin-top: 12px; }
    table { font-size: 11px; }
    th, td { padding: 6px 4px; }
    .description { min-width: 120px; }
  }
</style>
</head>
<body>
<main>
<header>
  <div><h1>${escapeHtml(documentLabel)}</h1><div class="party-name">${escapeHtml(issuerName)}</div>${issuerLegalNameLine}<div class="party-details">${partyDetails(issuer)}</div></div>
  <div class="document-meta"><div class="document-number">${escapeHtml(invoice.invoiceCode)}</div>
    <div class="muted">Date d'émission : ${escapeHtml(invoice.issueDate ?? "—")}</div>
    <div class="muted">Échéance : ${escapeHtml(invoice.dueDate ?? "—")}</div>
    ${invoice.purchaseOrderReference ? `<div class="muted">Commande : ${escapeHtml(invoice.purchaseOrderReference)}</div>` : ""}
    ${invoice.externalReference ? `<div class="muted">Référence : ${escapeHtml(invoice.externalReference)}</div>` : ""}
    ${invoice.serviceDate ? `<div class="muted">Prestation / livraison : ${escapeHtml(invoice.serviceDate)}</div>` : ""}
  </div>
</header>
<section class="columns">
  <div class="panel"><h2>Facturé à</h2><div class="party-name">${escapeHtml(customerName)}</div>
    <div class="party-details">${partyDetails(customer)}</div>
  </div>
  <div class="panel"><h2>Informations de facturation</h2>
    <div>Devise : <strong>${escapeHtml(invoice.currencyCode)}</strong></div>
    ${invoice.paymentTerms ? `<div>Conditions : ${escapeHtml(invoice.paymentTerms)}</div>` : ""}
  </div>
</section>
<h2 class="section-title">Détail des prestations</h2>
<table><thead><tr><th>#</th><th>Description</th><th class="number">Qté</th><th class="number">Prix unitaire</th><th class="number">Remise</th><th class="number">Taxe</th><th class="number">Total</th></tr></thead>
<tbody>${lines}</tbody></table>
<table class="totals">
<tr><td>Sous-total</td><td class="number">${escapeHtml(invoice.subtotal)} ${escapeHtml(invoice.currencyCode)}</td></tr>
<tr><td>Remises</td><td class="number">${escapeHtml(invoice.discountTotal)} ${escapeHtml(invoice.currencyCode)}</td></tr>
<tr><td>Base taxable</td><td class="number">${escapeHtml(invoice.taxableTotal)} ${escapeHtml(invoice.currencyCode)}</td></tr>
<tr><td>Taxes</td><td class="number">${escapeHtml(invoice.taxTotal)} ${escapeHtml(invoice.currencyCode)}</td></tr>
<tr class="grand"><td>${escapeHtml(documentLabel === "AVOIR" ? "Total de l’avoir" : "Total brut")}</td><td class="number">${escapeHtml(invoice.grandTotal)} ${escapeHtml(invoice.currencyCode)}</td></tr>
<tr><td><strong>${escapeHtml(documentLabel === "AVOIR" ? "Montant à créditer" : "Net à payer")}</strong></td><td class="number"><strong>${escapeHtml(invoice.amountDue)} ${escapeHtml(invoice.currencyCode)}</strong></td></tr>
</table>
${invoice.paymentInstructions ? `<section class="payment"><h2>Modalités de paiement</h2><p>${escapeHtml(invoice.paymentInstructions)}</p></section>` : ""}
${invoice.footerNote ? `<footer>${escapeHtml(invoice.footerNote)}</footer>` : ""}
</main>
</body>
</html>`;
}
