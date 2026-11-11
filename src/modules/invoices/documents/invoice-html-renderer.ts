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
  const { invoice, appliedRules, taxResult, documentLabel = "FACTURE" } = input;
  if (invoice.status !== "ISSUED" || !invoice.invoiceCode || invoice.taxStatus !== "CALCULATED" || !invoice.taxSnapshotId) {
    throw new Error("INVOICE_DOCUMENT_REQUIRES_ISSUED_TAX_SNAPSHOTTED_INVOICE");
  }

  const lines = invoice.lines.map((line) => `
    <tr>
      <td>${escapeHtml(line.lineNumber)}</td>
      <td>${escapeHtml(line.description)}</td>
      <td class="number">${escapeHtml(line.quantity)}</td>
      <td class="number">${escapeHtml(line.unitPrice)}</td>
      <td class="number">${escapeHtml(line.discountAmount)}</td>
      <td class="number">${escapeHtml(line.taxAmount)}</td>
      <td class="number">${escapeHtml(line.total)}</td>
    </tr>`).join("");

  const rules = appliedRules.map((rule) => `
    <li>${escapeHtml(rule["ruleCode"])} — ${escapeHtml(rule["treatment"])} — ${escapeHtml(rule["ratePercent"])}%</li>`).join("");

  const customer = invoice.customerSnapshot;
  const taxResultText = JSON.stringify(taxResult);
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Facture ${escapeHtml(invoice.invoiceCode)}</title>
<style>
  :root { color-scheme: light; font-family: Arial, Helvetica, sans-serif; color: #172033; }
  body { margin: 0; padding: 32px; background: #fff; font-size: 14px; }
  main { max-width: 1000px; margin: 0 auto; }
  header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #172033; padding-bottom: 20px; }
  h1 { font-size: 28px; margin: 0 0 8px; }
  h2 { font-size: 16px; margin: 24px 0 10px; }
  .muted { color: #5a6475; }
  .columns { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 24px; }
  .panel { border: 1px solid #d7dce4; border-radius: 8px; padding: 16px; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th, td { border-bottom: 1px solid #d7dce4; padding: 10px 8px; text-align: left; vertical-align: top; }
  th { background: #f3f5f8; font-size: 12px; }
  .number { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .totals { width: min(100%, 420px); margin: 20px 0 0 auto; }
  .totals td { border: 0; padding: 7px 0; }
  .grand { font-weight: 700; font-size: 18px; border-top: 2px solid #172033 !important; }
  .evidence { margin-top: 28px; padding: 12px; background: #f7f8fa; overflow-wrap: anywhere; }
  footer { margin-top: 28px; border-top: 1px solid #d7dce4; padding-top: 12px; font-size: 11px; color: #5a6475; }
  @media print { body { padding: 0; } .panel { break-inside: avoid; } tr { break-inside: avoid; } }
  @media (max-width: 640px) { body { padding: 14px; } header, .columns { display: block; } .panel { margin-top: 12px; } table { font-size: 11px; } th, td { padding: 6px 4px; } }
</style>
</head>
<body>
<main>
<header>
  <div><h1>${escapeHtml(documentLabel)}</h1><div class="muted">Document fiscal émis par ZENOX Finance</div></div>
  <div><strong>${escapeHtml(invoice.invoiceCode)}</strong><br><span class="muted">Date d'émission : ${escapeHtml(invoice.issueDate)}</span><br><span class="muted">Échéance : ${escapeHtml(invoice.dueDate ?? "—")}</span></div>
</header>
<section class="columns">
  <div class="panel"><h2>Client</h2><strong>${escapeHtml(customerValue(customer, "legalName") || customerValue(customer, "displayName"))}</strong><br>
    ${escapeHtml(customerValue(customer, "email"))}<br>${escapeHtml(customerValue(customer, "phone"))}<br>
    ${escapeHtml(customerValue(customer, "countryCode"))}<br>
    ${escapeHtml(customerValue(customer, "taxIdentifier"))}
  </div>
  <div class="panel"><h2>Référence du document</h2><div>Identifiant : ${escapeHtml(invoice.id)}</div>
    <div>Révision : ${escapeHtml(invoice.documentVersion)}</div><div>Devise : ${escapeHtml(invoice.currencyCode)}</div>
    <div>Référence du snapshot fiscal : ${escapeHtml(invoice.taxSnapshotId)}</div>
  </div>
</section>
<h2>Détail des prestations</h2>
<table><thead><tr><th>#</th><th>Description</th><th class="number">Qté</th><th class="number">Prix unitaire</th><th class="number">Remise</th><th class="number">Taxe</th><th class="number">Total</th></tr></thead>
<tbody>${lines}</tbody></table>
<table class="totals">
<tr><td>Sous-total</td><td class="number">${escapeHtml(invoice.subtotal)} ${escapeHtml(invoice.currencyCode)}</td></tr>
<tr><td>Remises</td><td class="number">${escapeHtml(invoice.discountTotal)} ${escapeHtml(invoice.currencyCode)}</td></tr>
<tr><td>Base taxable</td><td class="number">${escapeHtml(invoice.taxableTotal)} ${escapeHtml(invoice.currencyCode)}</td></tr>
<tr><td>Taxes</td><td class="number">${escapeHtml(invoice.taxTotal)} ${escapeHtml(invoice.currencyCode)}</td></tr>
<tr class="grand"><td>${escapeHtml(documentLabel === "AVOIR" ? "Total de l’avoir" : "Total brut")}</td><td class="number">${escapeHtml(invoice.grandTotal)} ${escapeHtml(invoice.currencyCode)}</td></tr>
<tr><td>${escapeHtml(documentLabel === "AVOIR" ? "Montant à créditer" : "Net à payer (après retenues)")}</td><td class="number"><strong>${escapeHtml(invoice.amountDue)} ${escapeHtml(invoice.currencyCode)}</strong></td></tr>
</table>
<section class="evidence"><h2>Règles fiscales appliquées</h2><ul>${rules}</ul>
<div class="muted">Le document conserve la référence d'un snapshot fiscal immuable. Hash du snapshot : ${escapeHtml(invoice.taxSnapshotId)}.</div>
<details><summary>Données de calcul (JSON)</summary><pre>${escapeHtml(taxResultText)}</pre></details></section>
${invoice.notes ? `<section><h2>Notes</h2><p>${escapeHtml(invoice.notes)}</p></section>` : ""}
<footer>Copie rendue par ZENOX Finance. Le contenu et son empreinte SHA-256 sont conservés comme artefact immuable. La conformité fiscale/légale et les obligations d'archivage doivent être validées pour chaque juridiction.</footer>
</main>
</body>
</html>`;
}
