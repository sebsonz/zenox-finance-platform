import { Download, FileText, Printer, ReceiptText } from "lucide-react";

export type IssuedInvoiceForCreditNotes = {
  id: string; invoiceCode: string | null; status: "DRAFT" | "ISSUED" | "CANCELLED";
  currencyCode: string; currencyMinorUnit: number;
};
export type CreditNoteRecord = {
  id: string; creditNoteCode: string; creditKind: "FULL" | "PARTIAL"; reason: string;
  currencyCode: string; grandTotal: string; issuedAt: string;
};
type Props = {
  invoice: IssuedInvoiceForCreditNotes | null;
  creditNotes: CreditNoteRecord[];
  creditReason: string;
  creditAmount: string;
  remainingCredit: number;
  busy: boolean;
  canCredit: boolean;
  onOpenInvoice: (invoice: IssuedInvoiceForCreditNotes) => void;
  onDownloadInvoice: (invoice: IssuedInvoiceForCreditNotes, format: "document" | "document.pdf") => void;
  onLoadCreditNotes: (invoice: IssuedInvoiceForCreditNotes) => void;
  onCreditReasonChange: (value: string) => void;
  onCreditAmountChange: (value: string) => void;
  onIssueCreditNote: (invoice: IssuedInvoiceForCreditNotes) => void;
  onOpenCreditNote: (id: string) => void;
  onDownloadCreditNote: (id: string, format: "document" | "document.pdf", code: string) => void;
};
const validAmount = /^(?:0|[1-9][0-9]{0,15})(?:[.][0-9]{1,8})?$/;

export function IssuedInvoiceDocumentsPanel(props: Props) {
  const invoice = props.invoice;
  if (!invoice || invoice.status !== "ISSUED") return null;
  return <section className="panel invoice-list-panel">
    <div className="panel-heading"><div><h2>Documents et avoirs</h2><p>{invoice.invoiceCode} · documents d’émission immuables · plusieurs avoirs partiels autorisés dans la limite du montant initial</p></div></div>
    <div className="invoice-action-bar">
      <button className="outline-button" onClick={() => props.onOpenInvoice(invoice)}><Printer size={15}/> Aperçu / imprimer</button>
      <button className="outline-button" disabled={props.busy} onClick={() => props.onDownloadInvoice(invoice, "document")}><Download size={15}/> HTML</button>
      <button className="outline-button" disabled={props.busy} onClick={() => props.onDownloadInvoice(invoice, "document.pdf")}><Download size={15}/> PDF</button>
      <button className="outline-button" disabled={props.busy} onClick={() => props.onLoadCreditNotes(invoice)}><ReceiptText size={15}/> Charger les avoirs</button>
    </div>
    <div className="invoice-form-grid credit-note-form">
      <label>Motif de l’avoir<input value={props.creditReason} onChange={(event) => props.onCreditReasonChange(event.target.value)} minLength={3} maxLength={2000}/></label>
      <label>Montant à créditer ({invoice.currencyCode})<input inputMode="decimal" value={props.creditAmount} onChange={(event) => props.onCreditAmountChange(event.target.value)} placeholder={`Vide = avoir intégral · reste disponible : ${props.remainingCredit.toFixed(invoice.currencyMinorUnit)}`}/></label>
      <div className="credit-note-button"><button className="primary-button" disabled={props.busy || !props.canCredit || props.creditReason.trim().length < 3 || (props.creditAmount.trim().length > 0 && !validAmount.test(props.creditAmount.trim()))} onClick={() => props.onIssueCreditNote(invoice)}>{props.creditAmount.trim() ? "Émettre l’avoir partiel" : "Émettre l’avoir intégral"}</button></div>
    </div>
    {props.creditNotes.length > 0 && <div className="table-scroll"><table className="invoice-table"><thead><tr><th>Avoir</th><th>Type</th><th>Motif</th><th>Montant</th><th>Date</th><th>Documents</th></tr></thead><tbody>{props.creditNotes.map((note) => <tr key={note.id}><td><strong>{note.creditNoteCode}</strong></td><td>{note.creditKind === "PARTIAL" ? "Partiel" : "Intégral"}</td><td>{note.reason}</td><td>{note.currencyCode} {note.grandTotal}</td><td>{new Date(note.issuedAt).toLocaleDateString("fr-FR")}</td><td><div className="invoice-actions"><button className="small-action" title="Aperçu / imprimer" onClick={() => props.onOpenCreditNote(note.id)}><Printer size={14}/></button><button className="small-action" title="HTML" onClick={() => props.onDownloadCreditNote(note.id, "document", note.creditNoteCode)}><Download size={14}/></button><button className="small-action" title="PDF" onClick={() => props.onDownloadCreditNote(note.id, "document.pdf", note.creditNoteCode)}><FileText size={14}/></button></div></td></tr>)}</tbody></table></div>}
  </section>;
}
