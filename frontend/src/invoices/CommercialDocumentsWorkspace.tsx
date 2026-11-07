import { useCallback, useEffect, useState, type FormEvent } from "react";
import { FilePlus2, RefreshCw, Send, CheckCircle2, XCircle, FileText } from "lucide-react";

type Props = { tenantId: string };
type Kind = "quotes" | "proformas";
type Line = { description: string; unit: string; quantity: string; unitPrice: string; discountPercent: string; taxRatePercent: string };
type Customer = { id: string; legalName: string; displayName?: string | null; status: string };
type CommercialLine = { lineNumber: number; description: string; unit?: string | null; quantity: string; unitPrice: string; discountPercent: string; taxRatePercent: string; subtotal: string; discountAmount: string; taxableAmount: string; taxAmount: string; total: string };
type CommercialDoc = {
  id: string; document_number: string | null; status: string; revision?: number; customer_id: string;
  customer_name?: string; currency_code: string; issue_date: string; valid_until: string | null;
  subtotal: string; discount_total: string; tax_total: string; grand_total: string; updated_at: string;
  customer_snapshot?: Record<string, unknown>; issuer_snapshot?: Record<string, unknown>;
  notes?: string | null; terms?: string | null; lines?: CommercialLine[];
};
const emptyLine = (): Line => ({ description: "", unit: "unité", quantity: "1", unitPrice: "0", discountPercent: "0", taxRatePercent: "0" });
const money = (value: string, currency: string) => new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(Number(value));

export function CommercialDocumentsWorkspace({ tenantId }: Props) {
  const [kind, setKind] = useState<Kind>("quotes");
  const [documents, setDocuments] = useState<CommercialDoc[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [currencyCode, setCurrencyCode] = useState("XOF");
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [selectedDocument, setSelectedDocument] = useState<CommercialDoc | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [docsResponse, customerResponse] = await Promise.all([
        fetch(`/api/v1/user/${tenantId}/${kind}?search=${encodeURIComponent(search)}`, { credentials: "same-origin", cache: "no-store" }),
        fetch(`/api/v1/user/${tenantId}/customers?limit=100`, { credentials: "same-origin", cache: "no-store" }),
      ]);
      const docsPayload = await docsResponse.json() as { data?: Record<string, CommercialDoc[]>; error?: { message?: string } };
      if (!docsResponse.ok) throw new Error(docsPayload.error?.message ?? "Impossible de charger les documents.");
      const customerPayload = await customerResponse.json() as { data?: { customers?: Customer[] } };
      setDocuments(docsPayload.data?.[kind] ?? []);
      setCustomers(customerPayload.data?.customers ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : "Erreur de chargement."); }
    finally { setLoading(false); }
  }, [tenantId, kind, search]);

  useEffect(() => { void load(); }, [load]);

  async function create(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/v1/user/${tenantId}/${kind}`, {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId, currencyCode, ...(validUntil ? { validUntil } : {}), notes, terms, lines }),
      });
      const payload = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Création impossible.");
      setNotice(kind === "quotes" ? "Devis créé en brouillon. Il reste modifiable avant envoi." : "Pro forma créée en brouillon. Elle n'est pas une facture fiscale.");
      setCustomerId(""); setValidUntil(""); setNotes(""); setTerms(""); setLines([emptyLine()]);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Création impossible."); }
    finally { setSaving(false); }
  }

  async function openDocument(doc: CommercialDoc) {
    setDetailLoading(true); setError("");
    try {
      const response = await fetch(`/api/v1/user/${tenantId}/${kind}/${doc.id}`, { credentials: "same-origin", cache: "no-store" });
      const payload = await response.json() as { data?: Record<string, CommercialDoc>; error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Impossible de charger le document.");
      setSelectedDocument(payload.data?.[kind === "quotes" ? "quote" : "pro forma"] ?? null);
      if (!payload.data?.[kind === "quotes" ? "quote" : "pro forma"]) throw new Error("Le document détaillé est introuvable.");
    } catch (e) { setError(e instanceof Error ? e.message : "Impossible de charger le document."); }
    finally { setDetailLoading(false); }
  }

  function printDocument(doc: CommercialDoc) {
    const esc = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[ch] ?? ch));
    const issuer = doc.issuer_snapshot ?? {};
    const customer = doc.customer_snapshot ?? {};
    const name = (obj: Record<string, unknown>, key: string) => esc(obj[key] ?? "");
    const docTitle = kind === "quotes" ? "DEVIS" : "FACTURE PRO FORMA";
    const rows = (doc.lines ?? []).map(line => `<tr><td>${esc(line.lineNumber)}</td><td>${esc(line.description)}<small>${esc(line.unit ?? "")}</small></td><td>${esc(line.quantity)}</td><td>${esc(line.unitPrice)}</td><td>${esc(line.discountAmount)}</td><td>${esc(line.taxAmount)}</td><td>${esc(line.total)}</td></tr>`).join("");
    const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${docTitle} ${esc(doc.document_number)}</title><style>
      *{box-sizing:border-box}body{font:13px/1.5 Arial,sans-serif;color:#172033;margin:0;background:#eef1f5}.sheet{width:210mm;min-height:297mm;margin:24px auto;padding:18mm;background:white;box-shadow:0 8px 32px #17203320}
      header{display:flex;justify-content:space-between;gap:24px;border-bottom:3px solid #172033;padding-bottom:22px}h1{font-size:27px;margin:0 0 8px;letter-spacing:.04em}h2{font-size:12px;text-transform:uppercase;color:#667085;letter-spacing:.08em;margin:0 0 10px}
      .number{font-size:17px;font-weight:700;text-align:right}.muted{color:#667085}.parties{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:26px 0}.panel{padding:16px;background:#f7f8fa;border:1px solid #e4e7ec;border-radius:6px;overflow-wrap:anywhere}
      table{width:100%;border-collapse:collapse;margin-top:20px}th{background:#172033;color:white;text-align:left;font-size:10px;text-transform:uppercase}td,th{padding:10px 8px;border-bottom:1px solid #e4e7ec}td:nth-child(n+3){text-align:right}small{display:block;color:#667085}
      .totals{width:48%;margin:18px 0 0 auto}.totals td{border:0;padding:6px}.totals tr:last-child{font-size:17px;font-weight:bold;border-top:2px solid #172033}
      .notice{margin:22px 0;padding:12px 16px;border:1px solid #d0d5dd;background:#f9fafb;font-weight:bold;letter-spacing:.04em}.terms{margin-top:24px;padding:14px;background:#f7f8fa;white-space:pre-wrap}
      footer{margin-top:40px;border-top:1px solid #d0d5dd;padding-top:12px;color:#667085;font-size:10px}
      @media print{body{background:white}.sheet{margin:0;box-shadow:none;width:auto;min-height:0;padding:0} @page{size:A4;margin:16mm}}
    </style></head><body><main class="sheet"><header><div><h1>${docTitle}</h1><strong>${name(issuer,"tradeName") || name(issuer,"legalName") || "Entreprise émettrice"}</strong><div>${name(issuer,"legalName")}</div><div class="muted">${name(issuer,"email")} · ${name(issuer,"phone")}</div><div class="muted">${name(issuer,"address")}</div></div><div><div class="number">${esc(doc.document_number ?? "BROUILLON")}</div><div class="muted">Émis le : ${esc(doc.issue_date)}</div><div class="muted">Valide jusqu’au : ${esc(doc.valid_until ?? "—")}</div><div class="muted">Révision : ${esc(doc.revision ?? 1)}</div></div></header>
      <div class="notice">${kind === "quotes" ? "PROPOSITION COMMERCIALE — SOUS RÉSERVE D’ACCEPTATION" : "DOCUMENT PRO FORMA — NON FISCAL, NE VAUT PAS FACTURE"} · ${esc(doc.status)}</div>
      <section class="parties"><div class="panel"><h2>Émetteur</h2><strong>${name(issuer,"legalName") || name(issuer,"tradeName")}</strong><div>${name(issuer,"address")}</div><div>${name(issuer,"countryCode")}</div><div>${name(issuer,"email")}</div><div>${name(issuer,"phone")}</div></div><div class="panel"><h2>Destinataire</h2><strong>${name(customer,"legalName") || name(customer,"displayName") || esc(doc.customer_name)}</strong><div>${name(customer,"address")}</div><div>${name(customer,"postalCode")} ${name(customer,"city")}</div><div>${name(customer,"countryCode")}</div><div>${name(customer,"email")}</div><div>${name(customer,"phone")}</div><div>Identifiant fiscal : ${name(customer,"taxIdentifier")}</div></div></section>
      <h2>Détail des prestations et marchandises</h2><table><thead><tr><th>#</th><th>Description</th><th>Qté</th><th>Prix unitaire</th><th>Remise</th><th>Taxe</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table>
      <table class="totals"><tr><td>Sous-total</td><td>${money(doc.subtotal,doc.currency_code)}</td></tr><tr><td>Remises</td><td>${money(doc.discount_total,doc.currency_code)}</td></tr><tr><td>Taxes estimatives</td><td>${money(doc.tax_total,doc.currency_code)}</td></tr><tr><td>TOTAL</td><td>${money(doc.grand_total,doc.currency_code)}</td></tr></table>
      ${doc.terms ? `<section class="terms"><h2>Conditions commerciales</h2>${esc(doc.terms)}</section>` : ""}${doc.notes ? `<section class="terms"><h2>Notes</h2>${esc(doc.notes)}</section>` : ""}
      <footer>Document généré par ZENOX Finance · Devise : ${esc(doc.currency_code)} · Les taxes et montants de ce document commercial sont estimatifs et ne remplacent pas le calcul fiscal d’une facture émise.</footer></main><script>window.onload=()=>window.print()</script></body></html>`;
    const popup = window.open("", "_blank", "noopener,noreferrer");
    if (!popup) { setError("Autorisez les fenêtres contextuelles pour afficher et imprimer le document."); return; }
    popup.document.write(html); popup.document.close();
  }

  async function transition(doc: CommercialDoc, action: string) {
    setError(""); setNotice("");
    try {
      const response = await fetch(`/api/v1/user/${tenantId}/${kind}/${doc.id}/transition`, {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, expectedUpdatedAt: new Date(doc.updated_at).toISOString() }),
      });
      const payload = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Transition refusée.");
      setNotice("Statut du document mis à jour."); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Transition refusée."); }
  }

  return <section className="invoice-workspace">
    <div className="invoice-page-heading">
      <div><span className="eyebrow">DOCUMENTS COMMERCIAUX</span><h1>Devis & pro forma</h1><p>Deux documents distincts des factures émises, avec leur propre cycle de vie.</p></div>
      <button className="secondary-button" onClick={() => void load()}><RefreshCw size={16}/> Actualiser</button>
    </div>
    <div className="invoice-toolbar">
      <div className="segmented-tabs">
        <button className={kind === "quotes" ? "active" : ""} onClick={() => setKind("quotes")}>Devis</button>
        <button className={kind === "proformas" ? "active" : ""} onClick={() => setKind("proformas")}>Factures pro forma</button>
      </div>
      <input aria-label="Rechercher" placeholder="Rechercher par numéro ou client" value={search} onChange={e => setSearch(e.target.value)}/>
    </div>
    {error && <div className="form-error">{error}</div>}
    {notice && <div className="form-success">{notice}</div>}
    {selectedDocument && <section className="invoice-form-panel commercial-document-preview"><div className="panel-heading"><div><h2>{kind === "quotes" ? "Aperçu du devis" : "Aperçu de la facture pro forma"}</h2><span>{selectedDocument.document_number ?? "Brouillon"} · {selectedDocument.status}</span></div><div><button type="button" onClick={() => printDocument(selectedDocument)}>Imprimer / Enregistrer en PDF</button><button type="button" onClick={() => setSelectedDocument(null)}>Fermer</button></div></div><div className="commercial-preview-sheet"><div className="commercial-preview-header"><div><span className="eyebrow">{kind === "quotes" ? "PROPOSITION COMMERCIALE" : "DOCUMENT PRÉVISIONNEL NON FISCAL"}</span><h1>{kind === "quotes" ? "DEVIS" : "FACTURE PRO FORMA"}</h1><strong>{String(selectedDocument.issuer_snapshot?.tradeName ?? selectedDocument.issuer_snapshot?.legalName ?? "Émetteur")}</strong><p>{String(selectedDocument.issuer_snapshot?.address ?? "")}</p></div><div><strong>{selectedDocument.document_number ?? "BROUILLON"}</strong><p>Émission : {new Date(selectedDocument.issue_date).toLocaleDateString("fr-FR")}</p><p>Validité : {selectedDocument.valid_until ? new Date(selectedDocument.valid_until).toLocaleDateString("fr-FR") : "Non précisée"}</p><p>Révision : {selectedDocument.revision ?? 1}</p></div></div><div className="commercial-preview-parties"><div><h3>Émetteur</h3><strong>{String(selectedDocument.issuer_snapshot?.legalName ?? selectedDocument.issuer_snapshot?.tradeName ?? "")}</strong><p>{String(selectedDocument.issuer_snapshot?.email ?? "")}</p><p>{String(selectedDocument.issuer_snapshot?.phone ?? "")}</p></div><div><h3>Destinataire</h3><strong>{String(selectedDocument.customer_snapshot?.legalName ?? selectedDocument.customer_snapshot?.displayName ?? selectedDocument.customer_name ?? "")}</strong><p>{String(selectedDocument.customer_snapshot?.address ?? "")}</p><p>{String(selectedDocument.customer_snapshot?.email ?? "")}</p><p>{String(selectedDocument.customer_snapshot?.phone ?? "")}</p></div></div><div className="form-info">{kind === "quotes" ? "Offre commerciale soumise à acceptation du client." : "Document non fiscal : ne constitue pas une facture définitive et ne crée pas à lui seul une créance fiscale."}</div><div className="table-scroll"><table className="invoice-table"><thead><tr><th>#</th><th>Description</th><th>Qté</th><th>Prix unitaire</th><th>Remise</th><th>Taxe estimative</th><th>Total</th></tr></thead><tbody>{(selectedDocument.lines ?? []).map(line => <tr key={line.lineNumber}><td>{line.lineNumber}</td><td>{line.description}<small>{line.unit}</small></td><td>{line.quantity}</td><td>{money(line.unitPrice,selectedDocument.currency_code)}</td><td>{line.discountPercent}%</td><td>{money(line.taxAmount,selectedDocument.currency_code)}</td><td>{money(line.total,selectedDocument.currency_code)}</td></tr>)}</tbody></table></div><div className="commercial-preview-totals"><p><span>Sous-total</span><strong>{money(selectedDocument.subtotal,selectedDocument.currency_code)}</strong></p><p><span>Remises</span><strong>{money(selectedDocument.discount_total,selectedDocument.currency_code)}</strong></p><p><span>Taxes estimatives</span><strong>{money(selectedDocument.tax_total,selectedDocument.currency_code)}</strong></p><p className="grand"><span>Total</span><strong>{money(selectedDocument.grand_total,selectedDocument.currency_code)}</strong></p></div>{selectedDocument.terms && <div><h3>Conditions commerciales</h3><p>{selectedDocument.terms}</p></div>}{selectedDocument.notes && <div><h3>Notes</h3><p>{selectedDocument.notes}</p></div>}</div></section>}
    {detailLoading && <div className="empty-state">Chargement du document détaillé…</div>}
    <div className="invoice-layout">
      <div className="invoice-list-panel">
        <div className="panel-heading"><div><h2>{kind === "quotes" ? "Liste des devis" : "Liste des pro forma"}</h2><span>{documents.length} document(s)</span></div></div>
        {loading ? <div className="empty-state">Chargement…</div> : documents.length === 0 ? <div className="empty-state"><FileText size={26}/><strong>Aucun document</strong><span>Créez votre premier {kind === "quotes" ? "devis" : "document pro forma"}.</span></div> :
          <div className="invoice-list">{documents.map(doc => <article className="invoice-list-item" key={doc.id}>
            <div className="invoice-list-main"><strong>{doc.document_number ?? (kind === "quotes" ? "Brouillon de devis" : "Brouillon pro forma")}</strong><span>{doc.customer_name ?? doc.customer_id}</span><small>{new Date(doc.issue_date).toLocaleDateString("fr-FR")} · {doc.status} {doc.revision ? `· Rév. ${doc.revision}` : ""}</small></div>
            <div className="invoice-list-total"><strong>{money(doc.grand_total, doc.currency_code)}</strong><button type="button" onClick={() => void openDocument(doc)}>Voir / aperçu</button>
              {kind === "quotes" && doc.status === "DRAFT" && <button onClick={() => void transition(doc, "SEND")}><Send size={14}/> Envoyer</button>}
              {kind === "quotes" && doc.status === "SENT" && <><button onClick={() => void transition(doc, "ACCEPT")}><CheckCircle2 size={14}/> Accepter</button><button onClick={() => void transition(doc, "REJECT")}><XCircle size={14}/> Refuser</button></>}
              {kind === "proformas" && doc.status === "DRAFT" && <button onClick={() => void transition(doc, "PUBLISH")}><Send size={14}/> Publier</button>}
            </div>
          </article>)}</div>}
      </div>
      <form className="invoice-form-panel" onSubmit={create}>
        <div className="panel-heading"><div><h2><FilePlus2 size={18}/> Nouveau {kind === "quotes" ? "devis" : "document pro forma"}</h2><span>Brouillon commercial</span></div></div>
        {kind === "proformas" && <div className="form-info">Document prévisionnel non fiscal. Il ne crée aucune créance et ne remplace pas une facture définitive.</div>}
        <label>Client<select required value={customerId} onChange={e => setCustomerId(e.target.value)}><option value="">Sélectionner un client</option>{customers.filter(c => c.status === "ACTIVE").map(c => <option key={c.id} value={c.id}>{c.displayName || c.legalName}</option>)}</select></label>
        <div className="form-grid-two"><label>Devise<input required maxLength={3} value={currencyCode} onChange={e => setCurrencyCode(e.target.value.toUpperCase())}/></label><label>Valide jusqu'au<input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)}/></label></div>
        <div className="commercial-lines-heading"><strong>Lignes du document</strong><button type="button" onClick={() => setLines(current => [...current, emptyLine()])}>+ Ajouter une ligne</button></div>
        {lines.map((line,index) => <div className="commercial-line" key={index}>
          <label>Description<input required maxLength={1000} value={line.description} onChange={e => setLines(current => current.map((item,i) => i===index ? {...item,description:e.target.value} : item))}/></label>
          <div className="form-grid-three">
            <label>Quantité<input required inputMode="decimal" value={line.quantity} onChange={e => setLines(current => current.map((item,i) => i===index ? {...item,quantity:e.target.value} : item))}/></label>
            <label>Prix unitaire<input required inputMode="decimal" value={line.unitPrice} onChange={e => setLines(current => current.map((item,i) => i===index ? {...item,unitPrice:e.target.value} : item))}/></label>
            <label>TVA %<input required inputMode="decimal" value={line.taxRatePercent} onChange={e => setLines(current => current.map((item,i) => i===index ? {...item,taxRatePercent:e.target.value} : item))}/></label>
          </div>
          {lines.length > 1 && <button type="button" className="text-danger" onClick={() => setLines(current => current.filter((_,i) => i!==index))}>Supprimer la ligne</button>}
        </div>)}
        <label>Conditions commerciales<textarea rows={2} value={terms} onChange={e => setTerms(e.target.value)}/></label>
        <label>Notes<textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)}/></label>
        <button className="primary-button" type="submit" disabled={saving || !customerId}>{saving ? "Enregistrement…" : "Créer le brouillon"}</button>
      </form>
    </div>
  </section>;
}
