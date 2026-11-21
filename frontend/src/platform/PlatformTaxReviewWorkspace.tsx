import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AlertCircle, CheckCircle2, ClipboardCheck, LogOut, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import "./PlatformTaxAdmin.css";

type Approval = {
  approval_id: string; rule_id: string; version: number; status: string;
  submitted_by_subject: string; submitted_at: string;
  jurisdiction_code: string; country_code: string; rule_code: string; name: string;
  tax_type: string; treatment: string; rate_percent: string; price_mode: string;
  accounting_treatment: string; valid_from: string; valid_to: string | null;
  source_reference: string | null; source_url: string | null; decision_reason: string | null;
};
type ApiPayload<T> = { data?: T; error?: { message?: string } };
const statusLabel: Record<string, string> = {
  PENDING_REVIEW: "À examiner", APPROVED: "Approuvée", REJECTED: "Rejetée", CANCELLED: "Annulée",
};
async function readData<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({})) as ApiPayload<T>;
  if (!response.ok || payload.data === undefined) throw new Error(payload.error?.message ?? "Impossible de charger la file de revue.");
  return payload.data;
}

export function PlatformTaxReviewWorkspace({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  const [items, setItems] = useState<Approval[]>([]);
  const [filter, setFilter] = useState("PENDING_REVIEW");
  const [selected, setSelected] = useState<Approval | null>(null);
  const [decision, setDecision] = useState<"APPROVE" | "REJECT">("APPROVE");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/v1/user/platform/tax/approvals?page=1&pageSize=100", {
        credentials: "same-origin", cache: "no-store",
      });
      const data = await readData<{ items: Approval[] }>(response);
      setItems(data.items);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "La file de revue est inaccessible."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || saving) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/v1/user/platform/tax/approvals/${selected.approval_id}/review`, {
        method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision, reason }),
      });
      const data = await readData<{ status: string }>(response);
      setNotice(data.status === "APPROVED"
        ? "Règle approuvée et activée. La version examinée est maintenant publiée."
        : "Règle rejetée. Le motif de décision est conservé dans le journal d’audit.");
      setSelected(null); setReason(""); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "La décision n’a pas pu être enregistrée."); }
    finally { setSaving(false); }
  }

  const filtered = items.filter((item) => item.status === filter);
  const pending = items.filter((item) => item.status === "PENDING_REVIEW").length;

  return <main className="ptrw-shell">
    <header className="ptrw-header">
      <div><div className="pta-eyebrow"><ShieldCheck size={14}/> ZENOX FINANCE · CONTRÔLE FISCAL</div><h1>Revue des règles fiscales</h1><p>File de validation déléguée — vos permissions sont limitées aux juridictions qui vous ont été attribuées.</p></div>
      <div className="ptrw-user"><span>{email}</span><button onClick={load} disabled={loading}><RefreshCw size={15}/> Actualiser</button><button onClick={onSignOut}><LogOut size={15}/> Déconnexion</button></div>
    </header>
    <div className="ptrw-summary"><div><span>À examiner</span><strong>{pending}</strong></div><div><span>Portée</span><strong>Jurisdiction-scoped</strong></div><div><span>Contrôle</span><strong>Double validation</strong></div></div>
    {error && <div className="pta-error"><AlertCircle size={15}/>{error}</div>}
    {notice && <div className="pta-notice"><CheckCircle2 size={15}/>{notice}<button onClick={() => setNotice("")}><XCircle size={15}/></button></div>}
    <section className="pta-panel">
      <div className="pta-panel-head"><div><h3>Demandes de validation</h3><p>La décision est vérifiée par PostgreSQL : auto-approbation interdite, permission de revue contrôlée à chaque action.</p></div><label className="pta-field">État<select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="PENDING_REVIEW">À examiner</option><option value="APPROVED">Approuvées</option><option value="REJECTED">Rejetées</option><option value="CANCELLED">Annulées</option></select></label></div>
      {selected && <form className="pta-review-form" onSubmit={(e) => void submitReview(e)}>
        <div><strong>{selected.rule_code} · v{selected.version}</strong><small>{selected.name} — {selected.jurisdiction_code}</small></div>
        <label className="pta-field">Décision<select value={decision} onChange={(e) => setDecision(e.target.value as "APPROVE" | "REJECT")}><option value="APPROVE">Approuver et activer</option><option value="REJECT">Rejeter</option></select></label>
        <label className="pta-field">{decision === "REJECT" ? "Motif de rejet obligatoire (10–1000 caractères)" : "Note de revue (facultative)"}<textarea rows={2} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)}/></label>
        <div className="pta-actions"><button className="pta-primary" disabled={saving || (decision === "REJECT" && reason.trim().length < 10)}>{saving ? "Traitement…" : "Confirmer la décision"}</button><button type="button" onClick={() => setSelected(null)}>Annuler</button></div>
      </form>}
      {loading && !items.length ? <div className="pta-empty">Chargement de la file de revue…</div> : !filtered.length ? <div className="pta-empty">Aucune demande pour ce filtre et votre périmètre d’autorisation.</div> :
      <div className="pta-table-wrap"><table className="pad-table"><thead><tr><th>Règle / version</th><th>Juridiction</th><th>Traitement</th><th>Taux</th><th>Source légale</th><th>Soumise par</th><th>Soumise le</th><th>Statut</th><th>Action</th></tr></thead><tbody>{filtered.map((item) => <tr key={item.approval_id}>
        <td><strong>{item.name}</strong><small>{item.rule_code} · v{item.version}</small></td><td>{item.jurisdiction_code} · {item.country_code}</td><td>{item.tax_type}<small>{item.treatment} · {item.accounting_treatment}</small></td><td>{item.rate_percent}%<small>{item.price_mode}</small></td><td>{item.source_reference ?? "—"}{item.source_url && <small><a href={item.source_url} target="_blank" rel="noreferrer">Consulter la source</a></small>}</td><td><small>{item.submitted_by_subject}</small></td><td>{new Date(item.submitted_at).toLocaleString("fr-FR")}</td><td><span className={`pta-status pta-status-${item.status.toLowerCase()}`}>{statusLabel[item.status] ?? item.status}</span></td><td>{item.status === "PENDING_REVIEW" ? <button className="pta-action-link" onClick={() => { setSelected(item); setDecision("APPROVE"); setReason(""); }}><ClipboardCheck size={14}/> Examiner</button> : <small>{item.decision_reason ?? "—"}</small>}</td>
      </tr>)}</tbody></table></div>}
    </section>
    <footer className="pta-footnote"><ShieldCheck size={15}/> Une délégation ne confère aucun accès aux données des autres juridictions. La base contrôle la portée et la validité de vos permissions lors de chaque revue.</footer>
  </main>;
}
