import { useCallback, useEffect, useState, type FormEvent } from "react";
import { FilePlus2, RefreshCw, Send, CheckCircle2, XCircle, FileText } from "lucide-react";

type Props = { tenantId: string };
type Kind = "quotes" | "proformas";
type Line = { description: string; unit: string; quantity: string; unitPrice: string; discountPercent: string; taxRatePercent: string };
type Customer = { id: string; legalName: string; displayName?: string | null; status: string };
type CommercialDoc = {
  id: string; document_number: string | null; status: string; revision?: number; customer_id: string;
  customer_name?: string; currency_code: string; issue_date: string; valid_until: string | null;
  subtotal: string; discount_total: string; tax_total: string; grand_total: string; updated_at: string;
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
    <div className="invoice-layout">
      <div className="invoice-list-panel">
        <div className="panel-heading"><div><h2>{kind === "quotes" ? "Liste des devis" : "Liste des pro forma"}</h2><span>{documents.length} document(s)</span></div></div>
        {loading ? <div className="empty-state">Chargement…</div> : documents.length === 0 ? <div className="empty-state"><FileText size={26}/><strong>Aucun document</strong><span>Créez votre premier {kind === "quotes" ? "devis" : "document pro forma"}.</span></div> :
          <div className="invoice-list">{documents.map(doc => <article className="invoice-list-item" key={doc.id}>
            <div className="invoice-list-main"><strong>{doc.document_number ?? (kind === "quotes" ? "Brouillon de devis" : "Brouillon pro forma")}</strong><span>{doc.customer_name ?? doc.customer_id}</span><small>{new Date(doc.issue_date).toLocaleDateString("fr-FR")} · {doc.status} {doc.revision ? `· Rév. ${doc.revision}` : ""}</small></div>
            <div className="invoice-list-total"><strong>{money(doc.grand_total, doc.currency_code)}</strong>
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
