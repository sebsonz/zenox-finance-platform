import { useEffect, useState } from "react";
import { CheckCircle2, CircleAlert, ClipboardCheck, LoaderCircle, RefreshCw, ShieldCheck, XCircle } from "lucide-react";

type PendingRegistration = {
  id: string;
  tenantId: string;
  legalName: string;
  countryCode: string;
  defaultCurrency: string;
  submittedAt: string;
};
type ApiPayload<T> = { data?: T; error?: { code?: string; message?: string } };

async function readPayload<T>(response: Response, fallback: string): Promise<T> {
  const payload = await response.json().catch(() => ({})) as ApiPayload<T>;
  if (!response.ok || payload.data === undefined) {
    throw new Error(payload.error?.message ?? fallback);
  }
  return payload.data;
}

export function PlatformReviewWorkspace({ searchQuery = "" }: { searchQuery?: string }) {
  const [requests, setRequests] = useState<PendingRegistration[]>([]);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadRequests() {
    setLoading(true);
    setError("");
    try {
      const data = await readPayload<{ requests: PendingRegistration[] }>(
        await fetch("/api/v1/user/platform/registration-requests", {
          credentials: "same-origin",
          cache: "no-store",
        }),
        "Impossible de charger les demandes d’inscription.",
      );
      setRequests(data.requests ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible de charger les demandes.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadRequests(); }, []);

  const normalizedSearch = searchQuery.trim().toLocaleLowerCase("fr");
  const visibleRequests = requests.filter((request) => [request.legalName, request.countryCode, request.defaultCurrency, request.id]
    .some((value) => value.toLocaleLowerCase("fr").includes(normalizedSearch)));

  async function decide(request: PendingRegistration, decision: "APPROVE" | "REJECT") {
    const reason = (reasons[request.id] ?? "").trim();
    if (decision === "REJECT" && reason.length < 10) {
      setError("Pour refuser une demande, indiquez un motif clair d’au moins 10 caractères.");
      return;
    }
    setBusyId(request.id);
    setError("");
    setNotice("");
    try {
      await readPayload<{ request: { id: string; status: string } }>(
        await fetch(`/api/v1/user/platform/registration-requests/${request.id}/decision`, {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(decision === "APPROVE" ? { decision } : { decision, reason }),
        }),
        "La décision n’a pas pu être enregistrée.",
      );
      setNotice(decision === "APPROVE"
        ? `L’organisation « ${request.legalName} » est activée.`
        : `La demande de « ${request.legalName} » a été refusée.`);
      setReasons((current) => {
        const next = { ...current };
        delete next[request.id];
        return next;
      });
      await loadRequests();
    } catch (e) {
      setError(e instanceof Error ? e.message : "La décision n’a pas pu être enregistrée.");
    } finally {
      setBusyId("");
    }
  }

  return <section className="platform-review">
    <div className="platform-review-heading">
      <div>
        <div className="eyebrow"><ShieldCheck size={14}/> ADMINISTRATION SÉCURISÉE</div>
        <h1>Demandes d’inscription</h1>
        <p>Vérifiez les organisations avant d’activer leur espace financier.{normalizedSearch ? ` · ${visibleRequests.length} résultat(s)` : ""}</p>
      </div>
      <button className="outline-button" type="button" onClick={() => void loadRequests()} disabled={loading}><RefreshCw size={15}/> Actualiser</button>
    </div>
    <div className="platform-review-banner"><ShieldCheck size={18}/><span>Cette page est réservée aux opérateurs explicitement autorisés côté serveur. Chaque décision active ou bloque l’organisation et est inscrite dans l’audit.</span></div>
    {notice && <div className="registration-notice"><CheckCircle2 size={17}/><span>{notice}</span></div>}
    {error && <div className="registration-error"><CircleAlert size={17}/><span>{error}</span></div>}
    {loading ? <div className="platform-review-empty"><LoaderCircle size={22} className="spin"/><p>Chargement des demandes…</p></div>
      : visibleRequests.length === 0 ? <div className="platform-review-empty"><ClipboardCheck size={28}/><strong>{normalizedSearch ? "Aucun résultat pour cette recherche" : "Aucune demande en attente"}</strong><p>{normalizedSearch ? "Essayez un autre nom d’organisation, pays, devise ou identifiant." : "Les nouvelles inscriptions apparaîtront ici après confirmation de l’e-mail et soumission de l’organisation."}</p></div>
      : <div className="platform-review-list">{visibleRequests.map((request) => <article className="platform-review-card" key={request.id}>
        <div className="platform-review-card-header"><div><span className="platform-review-status">EN ATTENTE</span><h2>{request.legalName}</h2><p>{request.countryCode} · Devise par défaut : {request.defaultCurrency}</p></div><small>{new Date(request.submittedAt).toLocaleString()}</small></div>
        <p className="platform-review-reference">Référence : {request.id}</p>
        <label className="platform-review-reason">Motif de refus (obligatoire uniquement en cas de refus)<textarea value={reasons[request.id] ?? ""} onChange={(event) => setReasons((current) => ({ ...current, [request.id]: event.target.value }))} minLength={10} maxLength={1000} placeholder="Expliquez les informations manquantes ou non vérifiables…"/></label>
        <div className="platform-review-actions">
          <button type="button" className="platform-review-reject" disabled={Boolean(busyId)} onClick={() => void decide(request, "REJECT")}>{busyId === request.id ? <LoaderCircle size={16} className="spin"/> : <XCircle size={16}/>} Refuser</button>
          <button type="button" className="registration-primary platform-review-approve" disabled={Boolean(busyId)} onClick={() => void decide(request, "APPROVE")}>{busyId === request.id ? <LoaderCircle size={16} className="spin"/> : <CheckCircle2 size={16}/>} Approuver et activer</button>
        </div>
      </article>)}</div>}
  </section>;
}
