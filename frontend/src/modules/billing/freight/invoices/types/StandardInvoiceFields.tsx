import type { InvoiceTypeFieldsProps } from "./types.js";
export function StandardInvoiceFields(props: InvoiceTypeFieldsProps) {
  return <>
    <label>Client<select value={props.customerId} onChange={(event) => props.onCustomerChange(event.target.value)} required><option value="">Choisir un client actif</option>{props.customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.displayName || customer.legalName} · {customer.customerCode}</option>)}</select></label>
    <label>Devise<select value={props.currencyCode} onChange={(event) => props.onCurrencyChange(event.target.value)} required>{props.currencies.map((currency) => <option key={currency.code} value={currency.code}>{currency.code} · {currency.name}</option>)}</select></label>
    <label>Date d’échéance<input type="date" value={props.dueDate} onChange={(event) => props.onFieldChange("dueDate", event.target.value)}/></label>
    <label>Date de prestation / livraison<input type="date" value={props.serviceDate} onChange={(event) => props.onFieldChange("serviceDate", event.target.value)}/></label>
    <label>Référence commande<input value={props.purchaseOrderReference} maxLength={120} onChange={(event) => props.onFieldChange("purchaseOrderReference", event.target.value)} placeholder="BC-2026-0001"/></label>
    <label>Référence externe<input value={props.externalReference} maxLength={120} onChange={(event) => props.onFieldChange("externalReference", event.target.value)} placeholder="Référence client"/></label>
    <label>Conditions de paiement<input value={props.paymentTerms} maxLength={500} onChange={(event) => props.onFieldChange("paymentTerms", event.target.value)} placeholder="Paiement à 14 jours"/></label>
    <label>Modalités de paiement<input value={props.paymentInstructions} maxLength={2000} onChange={(event) => props.onFieldChange("paymentInstructions", event.target.value)} placeholder="Virement bancaire, Mobile Money…"/></label>
    <label>Note de bas de facture<input value={props.footerNote} maxLength={1000} onChange={(event) => props.onFieldChange("footerNote", event.target.value)} placeholder="Mentions complémentaires"/></label>
    <label>Notes / commentaires<input value={props.notes} maxLength={5000} onChange={(event) => props.onFieldChange("notes", event.target.value)} placeholder="Informations complémentaires"/></label>
  </>;
}