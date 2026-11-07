import type { InvoiceTypeFieldsProps } from "./types.js";
export function CreditNoteFields(props: InvoiceTypeFieldsProps) {
  const issuedInvoices = props.invoices.filter((invoice) => invoice.status === "ISSUED");
  return <>
    <label>Facture d’origine à créditer<select value={props.relatedInvoiceId} onChange={(event) => { const id = event.target.value; props.onRelatedInvoiceChange(issuedInvoices.find((invoice) => invoice.id === id), id); }} required><option value="">Sélectionner une facture émise</option>{issuedInvoices.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.invoiceCode} · {invoice.grandTotal} {invoice.currencyCode} · {invoice.customerSnapshot?.legalName ?? "Client"}</option>)}</select></label>
    <label>Motif de l’avoir<input value={props.creditNoteReason} onChange={(event) => props.onCreditReasonChange(event.target.value)} minLength={3} maxLength={2000} required placeholder="Motif commercial, retour, correction…"/></label>
    <label>Montant à créditer<input inputMode="decimal" value={props.creditNoteAmount} onChange={(event) => props.onCreditAmountChange(event.target.value)} placeholder="Vide = avoir intégral"/></label>
  </>;
}