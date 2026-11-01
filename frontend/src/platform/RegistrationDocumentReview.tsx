import { useEffect, useState } from "react";
import { CheckCircle2, Download, FileText, LoaderCircle, RefreshCw, XCircle } from "lucide-react";

type Doc = { id: string; document_type: string; original_filename: string; byte_size: number; status: string; review_note: string | null; created_at: string };
type Payload<T> = { data?: T; error?: { message?: string } };

async function payload<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as Payload<T>;
  if (!response.ok || body.data === undefined) throw new Error(body.error?.message || "Opération impossible.");
  return body.data;
}

export function RegistrationDocumentReview({ requestId }: { requestId: string }) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      const data = await payload<{ documents: Doc[] }>(await fetch("/api/v1/user/platform/registration-requests/" + requestId + "/documents", { credentials: "same-origin", cache: "no-store" }));
      setDocs(data.documents || []);
    } catch (e) { setError(e instanceof Error ? e.message : "Chargement impossible."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [requestId]);

  async function decide(doc: Doc, decision: "ACCEPT" | "REJECT") {
    const note = (notes[doc.id] || "").trim();
    if (decision === "REJECT" && note.length < 10) { setError("Le motif de rejet doit contenir au moins 10 caractères."); return; }
    setBusy(doc.id); setError(""); setNotice("");
    try {
      await payload(await fetch("/api/v1/user/platform/registration-requests/" + requestId + "/documents/" + doc.id + "/review", {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision, note: note || null }),
      }));
      setNotice(decision === "ACCEPT" ? "Justificatif accepté." : "Justificatif rejeté.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Décision impossible."); }
    finally { setBusy(""); }
  }

  return <section className="platform-document-review">
    <header><div><h3><FileText size={15}/> Justificatifs de l’organisation</h3><p>Pièces privées · accès opérateur contrôlé côté serveur</p></div><button type="button" className="outline-button" onClick={() => void load()} disabled={loading}><RefreshCw size={13}/> Actualiser</button></header>
    {notice && <p role="status" className="platform-document-notice">{notice}</p>}
    {error && <p role="alert" className="platform-document-error">{error}</p>}
    {loading ? <p className="platform-document-empty">Chargement…</p> : docs.length === 0 ? <p className="platform-document-empty">Aucun justificatif joint.</p> :
      <div className="platform-document-list">{docs.map((doc) => <article key={doc.id}>
        <div className="platform-document-file"><FileText size={17}/><div><strong>{doc.original_filename}</strong><small>{doc.document_type} · {(doc.byte_size / 1024).toFixed(0)} Ko · {new Date(doc.created_at).toLocaleDateString("fr-FR")}</small></div></div>
        <span className="platform-document-status">{doc.status === "UPLOADED" ? "À examiner" : doc.status === "ACCEPTED" ? "Accepté" : "Rejeté"}</span>
        <a href={"/api/v1/user/platform/registration-requests/" + requestId + "/documents/" + doc.id + "/content"} target="_blank" rel="noreferrer"><Download size={14}/> Télécharger</a>
        {doc.review_note && <p>Dernière note : {doc.review_note}</p>}
        <label>Note de revue<textarea value={notes[doc.id] || ""} onChange={(event) => setNotes((current) => ({ ...current, [doc.id]: event.target.value }))} maxLength={1000} placeholder="Obligatoire pour rejeter (10 caractères minimum)…"/></label>
        <div className="platform-document-actions">
          <button type="button" className="platform-review-reject" disabled={Boolean(busy)} onClick={() => void decide(doc, "REJECT")}>{busy === doc.id ? <LoaderCircle size={14}/> : <XCircle size={14}/>} Rejeter</button>
          <button type="button" className="registration-primary" disabled={Boolean(busy)} onClick={() => void decide(doc, "ACCEPT")}>{busy === doc.id ? <LoaderCircle size={14}/> : <CheckCircle2 size={14}/>} Accepter</button>
        </div>
      </article>)}</div>}
  </section>;
}
