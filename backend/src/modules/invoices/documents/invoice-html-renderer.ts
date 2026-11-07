import type { FinanceInvoice } from "../repositories/invoice.repository.js";

export interface InvoiceHtmlDocumentInput {
  invoice: FinanceInvoice;
  appliedRules: readonly Record<string, unknown>[];
  taxResult: Record<string, unknown>;
  documentLabel?: string;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}
function value(snapshot: Record<string, unknown>, key: string): string {
  return String(snapshot[key] ?? "");
}
function addressLines(address: unknown): string[] {
  if (!address || typeof address !== "object") return [];
  const a = address as Record<string, unknown>;
  return [a["line1"], a["line2"], [a["postalCode"], a["city"]].filter(Boolean).join(" "), a["region"], a["countryCode"]]
    .filter((part) => part !== null && part !== undefined && String(part).trim() !== "")
    .map(String);
}
function addressHtml(address: unknown): string {
  return addressLines(address).map(escapeHtml).join("<br>");
}
function money(amount: string, currency: string): string {
  return `${escapeHtml(amount)} ${escapeHtml(currency)}`;
}

export function renderInvoiceHtmlDocument(input: InvoiceHtmlDocumentInput): string {
  const { invoice, appliedRules, documentLabel = "FACTURE" } = input;
  if (invoice.status !== "ISSUED" || !invoice.invoiceCode || invoice.taxStatus !== "CALCULATED" || !invoice.taxSnapshotId) {
    throw new Error("INVOICE_DOCUMENT_REQUIRES_ISSUED_TAX_SNAPSHOTTED_INVOICE");
  }
  const seller = invoice.sellerSnapshot ?? {};
  const customer = invoice.customerSnapshot ?? {};
  const metadata = invoice.document ?? {};
  const sellerName = String(seller["tradeName"] || seller["legalName"] || "Émetteur");
  const customerName = String(customer["displayName"] || customer["legalName"] || "Client");
  const lines = invoice.lines.map((line) => `
    <tr>
      <td class="index">${escapeHtml(line.lineNumber)}</td>
      <td><small>${escapeHtml(line.lineType === "FEE" ? "FRAIS" : line.lineType === "EXPENSE" ? "DÉBOURS" : line.lineType === "SERVICE" ? "PRESTATION" : "ARTICLE")}</small><strong>${escapeHtml(line.description)}</strong>
        ${line.itemCode ? `<small>Réf. ${escapeHtml(line.itemCode)}</small>` : ""}
        ${line.lineNote ? `<small>${escapeHtml(line.lineNote)}</small>` : ""}
      </td>
      <td class="numeric">${escapeHtml(line.quantity)} ${escapeHtml(line.unit ?? "")}</td>
      <td class="numeric">${money(line.unitPrice, invoice.currencyCode)}</td>
      <td class="numeric">${escapeHtml(line.discountPercent)}%</td>
      <td class="numeric">${money(line.taxAmount, invoice.currencyCode)}</td>
      <td class="numeric total-cell">${money(line.total, invoice.currencyCode)}</td>
    </tr>`).join("");
  const metaRows = [
    ["Type de facture", metadata["invoiceKind"] === "ADVANCE" ? "Facture d’acompte" : metadata["invoiceKind"] === "BALANCE" ? "Facture de solde" : "Facture standard"],
    ["Référence source", metadata["sourceReference"]],
    ["Référence", metadata["reference"]],
    ["Bon de commande", metadata["purchaseOrderNumber"]],
    ["Contrat", metadata["contractReference"]],
    ["Date de livraison", metadata["deliveryDate"]],
    ["Période de service", [metadata["servicePeriodStart"], metadata["servicePeriodEnd"]].filter(Boolean).join(" au ")],
    ["Remise globale", metadata["globalDiscountPercent"] && metadata["globalDiscountPercent"] !== "0" ? `${metadata["globalDiscountPercent"]}%` : metadata["globalDiscountAmount"] && metadata["globalDiscountAmount"] !== "0" ? metadata["globalDiscountAmount"] : ""],
  ].filter((row) => row[1]);
  const paymentTerms = String(metadata["paymentTerms"] ?? "");
  const paymentMethod = String(metadata["paymentMethod"] ?? "");
  const footer = String(metadata["footer"] ?? "");
  return `<!doctype html>
<html lang="${escapeHtml(metadata["language"] ?? "fr")}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(documentLabel)} ${escapeHtml(invoice.invoiceCode)}</title>
<style>
:root{font-family:Inter,"Segoe UI",Arial,sans-serif;color:#172033;background:#fff;font-size:13px}
*{box-sizing:border-box}body{margin:0;padding:36px;background:#f3f5f8}main{max-width:980px;margin:0 auto;background:#fff;padding:48px 54px;box-shadow:0 12px 40px #17203312}
.topline{display:flex;justify-content:space-between;gap:24px;border-bottom:3px solid #172033;padding-bottom:26px}
.brand{font-size:22px;font-weight:800;letter-spacing:-.5px}.brand-sub{color:#667085;margin-top:5px}.doc-title{text-align:right}.doc-title h1{font-size:30px;letter-spacing:1.5px;margin:0 0 8px}.doc-code{font-weight:700;font-size:16px}
h2{font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#667085;margin:0 0 12px}
.parties{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin:30px 0}.party{padding:18px;border:1px solid #e4e7ec;border-radius:8px;min-height:142px}.party strong{font-size:15px}.party p{line-height:1.65;margin:8px 0 0;color:#475467}.muted{color:#667085}
.meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 24px;background:#f8fafc;padding:16px 18px;border-radius:8px;margin:20px 0}.meta div{display:flex;gap:8px}.meta b{color:#667085;min-width:135px}
table{width:100%;border-collapse:collapse;margin-top:22px}thead{display:table-header-group}th{background:#172033;color:#fff;font-size:10px;text-transform:uppercase;letter-spacing:.5px;padding:12px 9px;text-align:left}
td{border-bottom:1px solid #eaecf0;padding:13px 9px;vertical-align:top}td small{display:block;color:#667085;margin-top:4px}.numeric{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}.index{color:#667085;width:28px}.total-cell{font-weight:700}
.summary{width:390px;max-width:100%;margin:24px 0 0 auto}.summary td{border:0;padding:7px 4px}.summary tr:last-child td{border-top:2px solid #172033;padding-top:14px;font-size:18px;font-weight:800}
.terms{margin-top:28px;padding:18px;background:#f8fafc;border-radius:8px;line-height:1.6}.terms h2{margin-bottom:6px}.footer{margin-top:30px;padding-top:16px;border-top:1px solid #eaecf0;color:#667085;font-size:10px;line-height:1.5}
@media print{body{padding:0;background:#fff}main{box-shadow:none;padding:20mm 16mm;max-width:none}.party, .terms{break-inside:avoid}tr{break-inside:avoid}}
@media(max-width:640px){body{padding:0}main{padding:20px}.topline,.parties{display:block}.doc-title{text-align:left;margin-top:22px}.meta{grid-template-columns:1fr}table{font-size:10px}th,td{padding:7px 4px}.summary{width:100%}}
</style></head>
<body><main>
<header class="topline"><div><div class="brand">${escapeHtml(sellerName)}</div><div class="brand-sub">${escapeHtml(value(seller,"tenantCode"))}</div></div>
<div class="doc-title"><h1>${escapeHtml(String(metadata["title"] || documentLabel))}</h1><div class="doc-code">${escapeHtml(invoice.invoiceCode)}</div><div class="muted">Émise le ${escapeHtml(invoice.issueDate ?? "—")}</div><div class="muted">Échéance : ${escapeHtml(invoice.dueDate ?? "—")}</div></div></header>
<section class="parties">
<div class="party"><h2>Émetteur</h2><strong>${escapeHtml(sellerName)}</strong><p>${addressHtml(seller["address"])}<br>${escapeHtml(value(seller,"email"))}<br>${escapeHtml(value(seller,"phone"))}<br>${escapeHtml(value(seller,"website"))}<br>${escapeHtml(value(seller,"countryCode"))}</p></div>
<div class="party"><h2>Facturé à</h2><strong>${escapeHtml(customerName)}</strong><p>${addressHtml(customer["address"])}<br>${escapeHtml(value(customer,"email"))}<br>${escapeHtml(value(customer,"phone"))}<br>${escapeHtml(value(customer,"countryCode"))}<br>${customer["taxIdentifier"] ? "Identifiant fiscal : "+escapeHtml(customer["taxIdentifier"]) : ""}<br>${customer["registrationIdentifier"] ? "Immatriculation : "+escapeHtml(customer["registrationIdentifier"]) : ""}</p></div>
</section>
${metaRows.length ? `<section class="meta">${metaRows.map(([label, content])=>`<div><b>${escapeHtml(label)}</b><span>${escapeHtml(content)}</span></div>`).join("")}</section>` : ""}
<h2>Détail des biens et prestations</h2>
<table><thead><tr><th>#</th><th>Désignation</th><th class="numeric">Quantité</th><th class="numeric">Prix unitaire</th><th class="numeric">Remise</th><th class="numeric">Taxe</th><th class="numeric">Total</th></tr></thead><tbody>${lines}</tbody></table>
<table class="summary"><tr><td>Sous-total</td><td class="numeric">${money(invoice.subtotal,invoice.currencyCode)}</td></tr><tr><td>Remises</td><td class="numeric">− ${money(invoice.discountTotal,invoice.currencyCode)}</td></tr><tr><td>Base taxable</td><td class="numeric">${money(invoice.taxableTotal,invoice.currencyCode)}</td></tr><tr><td>Taxes</td><td class="numeric">${money(invoice.taxTotal,invoice.currencyCode)}</td></tr><tr><td>NET À PAYER</td><td class="numeric">${money(invoice.amountDue,invoice.currencyCode)}</td></tr></table>
${paymentTerms || paymentMethod ? `<section class="terms"><h2>Modalités de règlement</h2>${paymentTerms ? `<div>${escapeHtml(paymentTerms)}</div>` : ""}${paymentMethod ? `<div><b>Moyen de paiement :</b> ${escapeHtml(paymentMethod)}</div>` : ""}</section>` : ""}
${invoice.notes ? `<section class="terms"><h2>Notes</h2>${escapeHtml(invoice.notes)}</section>` : ""}
<footer class="footer">${escapeHtml(footer || "Document généré par ZENOX Finance. Les mentions obligatoires et règles fiscales applicables doivent être configurées selon la juridiction de l’émetteur.")}<br>Document émis et conservé dans un registre immuable.</footer>
</main></body></html>`;
}
