import { Download, Pencil, ReceiptText, RefreshCw, Send, ShieldCheck } from "lucide-react";
export type InvoiceListRecord = {
  id: string; invoiceCode: string | null; status: "DRAFT" | "ISSUED" | "CANCELLED";
  documentType: "STANDARD" | "DEPOSIT" | "BALANCE"; currencyCode: string; grandTotal: string;
  taxStatus: "PROVISIONAL" | "CALCULATED" | "REVIEW_REQUIRED";
  customerSnapshot?: { legalName?: string; displayName?: string };
};
type Props = {
  invoices: InvoiceListRecord[]; selectedInvoiceId: string; search: string; status: string;
  loading: boolean; busy: boolean; canManageTax: boolean; canIssue: boolean; hasJurisdiction: boolean;
  onSearchChange: (value: string) => void; onStatusChange: (value: string) => void;
  onSubmit: () => void; onEdit: (invoice: InvoiceListRecord) => void;
  onCalculateTax: (invoice: InvoiceListRecord) => void; onIssue: (invoice: InvoiceListRecord) => void;
  onDownload: (invoice: InvoiceListRecord, format: "document" | "document.pdf") => void;
  onLoadCreditNotes: (invoice: InvoiceListRecord) => void;
};
export function InvoiceListPanel(props: Props) {
  return <section className="panel invoice-list-panel">
    <div className="panel-heading"><div><h2>Factures de l’organisation</h2><p>{props.invoices.length} résultat(s) · recherche et filtres appliqués côté serveur.</p></div></div>
    <form className="tenant-lookup-form" onSubmit={(event) => { event.preventDefault(); props.onSubmit(); }}>
      <label>Recherche<input value={props.search} maxLength={120} onChange={(event) => props.onSearchChange(event.target.value)} placeholder="N° facture, client, référence externe ou commande"/></label>
      <label>Statut<select value={props.status} onChange={(event) => props.onStatusChange(event.target.value)}><option value="">Tous les statuts</option><option value="DRAFT">Brouillons</option><option value="ISSUED">Émises</option><option value="CANCELLED">Annulées</option></select></label>
      <button className="primary-button" type="submit" disabled={props.loading}>{props.loading ? "Recherche…" : "Rechercher"} <RefreshCw size={15}/></button>
    </form>
    <div className="table-scroll"><table className="invoice-table"><thead><tr><th>Référence</th><th>Type</th><th>Client</th><th>Statut</th><th>Taxe</th><th>Devise</th><th>Total</th><th>Actions</th></tr></thead>
      <tbody>{props.invoices.length ? props.invoices.map((invoice) => <tr key={invoice.id} className={props.selectedInvoiceId === invoice.id ? "selected-invoice-row" : ""}>
        <td><strong>{invoice.invoiceCode ?? "Brouillon"}</strong><small>{invoice.id.slice(0, 8)}…</small></td><td>{invoice.documentType === "DEPOSIT" ? "Acompte" : invoice.documentType === "BALANCE" ? "Solde" : "Standard"}</td><td>{invoice.customerSnapshot?.displayName ?? invoice.customerSnapshot?.legalName ?? "—"}</td>
        <td><span className={`invoice-status ${invoice.status.toLowerCase()}`}>{invoice.status}</span></td><td>{invoice.taxStatus === "CALCULATED" ? "Calculée" : invoice.taxStatus === "REVIEW_REQUIRED" ? "À revoir" : "Provisoire"}</td><td>{invoice.currencyCode}</td><td>{invoice.grandTotal}</td>
        <td><div className="invoice-actions">
          {invoice.status === "DRAFT" && <button title="Modifier" className="small-action" onClick={() => props.onEdit(invoice)}><Pencil size={14}/></button>}
          {invoice.status === "DRAFT" && <button title="Calculer la taxe" className="small-action" disabled={props.busy || !props.hasJurisdiction || !props.canManageTax || invoice.taxStatus === "CALCULATED"} onClick={() => props.onCalculateTax(invoice)}><ShieldCheck size={14}/></button>}
          {invoice.status === "DRAFT" && invoice.taxStatus === "CALCULATED" && <button title="Émettre" className="small-action" disabled={props.busy || !props.canIssue} onClick={() => props.onIssue(invoice)}><Send size={14}/></button>}
          {invoice.status === "ISSUED" && <button title="Télécharger PDF" className="small-action" disabled={props.busy} onClick={() => props.onDownload(invoice, "document.pdf")}><Download size={14}/></button>}
          {invoice.status === "ISSUED" && <button title="Historique des avoirs" className="small-action" onClick={() => props.onLoadCreditNotes(invoice)}><ReceiptText size={14}/></button>}
        </div></td></tr>) : <tr><td colSpan={8} className="invoice-empty">{props.loading ? "Chargement…" : "Aucune facture enregistrée pour cette organisation."}</td></tr>}</tbody>
    </table></div>
  </section>;
}
