import { StandardInvoiceFields } from "./StandardInvoiceFields.js";
import type { InvoiceTypeFieldsProps } from "./types.js";
export function BalanceInvoiceFields(props: InvoiceTypeFieldsProps) {
  const depositInvoices = props.invoices.filter((invoice) => invoice.status === "ISSUED" && invoice.documentType === "DEPOSIT");
  return <>
    <label>Facture d’acompte source<select value={props.relatedInvoiceId} onChange={(event) => { const id = event.target.value; props.onRelatedInvoiceChange(depositInvoices.find((invoice) => invoice.id === id), id); }} required><option value="">Sélectionner une facture d’acompte émise</option>{depositInvoices.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.invoiceCode} · {invoice.grandTotal} {invoice.currencyCode} · {invoice.customerSnapshot?.legalName ?? "Client"}</option>)}</select></label>
    <StandardInvoiceFields {...props}/>
  </>;
}