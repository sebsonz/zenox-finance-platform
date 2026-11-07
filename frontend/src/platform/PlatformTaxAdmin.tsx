import { useEffect, useState } from "react";
import { AlertCircle, RefreshCw, ShieldCheck } from "lucide-react";

type TaxRule = {
  id: string; jurisdictionId: string; ruleCode: string; name: string;
  taxType: string; treatment: string; ratePercent: string; priceMode: string;
  appliesTo: string; version: number; validFrom: string; validTo: string | null;
  status: "DRAFT" | "ACTIVE" | "RETIRED"; sourceReference: string | null;
};
type Page = { items: TaxRule[]; page: number; pageSize: number; hasMore: boolean; scope: "GLOBAL" };
type Payload<T> = { data?: T; error?: { message?: string } };

const taxTypes = ["", "VAT", "GST", "SALES_TAX", "EXCISE", "WITHHOLDING", "CUSTOMS_DUTY", "IMPORT_TAX", "ENVIRONMENTAL", "STAMP_DUTY", "OTHER"];
const statusLabels: Record<string, string> = { DRAFT: "Brouillon", ACTIVE: "Active", RETIRED: "Retirée" };

export function PlatformTaxAdmin() {
  const [page, setPage] = useState<Page | null>(null);
  const [search, setSearch] = useState("");
  const [taxType, setTaxType] = useState("");
  const [status, setStatus] = useState("");
  const [pageNumber, setPageNumber] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(pageNumber), pageSize: "25" });
    if (search.trim()) params.set("search", search.trim());
    if (taxType) params.set("taxType", taxType);
    if (status) params.set("status", status);
    setLoading(true);
    setError("");
    void fetch(`/api/v1/user/platform/tax/rules?${params.toString()}`, {
      credentials: "same-origin", cache: "no-store", signal: controller.signal,
    }).then(async (response) => {
      const payload = await response.json().catch(() => ({})) as Payload<Page>;
      if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? "Impossible de charger les règles fiscales.");
      setPage(payload.data);
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Erreur de chargement.");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [search, taxType, status, pageNumber, refreshKey]);

  const activeCount = page?.items.filter((item) => item.status === "ACTIVE").length ?? 0;
  const draftCount = page?.items.filter((item) => item.status === "DRAFT").length ?? 0;

  return <section className="pad-module pta-workspace">
    <div className="pad-module-tools">
      <div><h2>Référentiel fiscal global</h2><p>Règles communes aux juridictions et consultables par les organisations autorisées.</p></div>
      <div className="pad-module-actions"><span className="pad-source-label">API plateforme · lecture</span><button className="pad-refresh-button" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading}><RefreshCw size={14}/> Actualiser</button></div>
    </div>
    <div className="pad-feature-grid pta-summary">
      <article className="pad-feature-card"><span className="pad-feature-number">01</span><strong>{loading ? "…" : activeCount}</strong><span>Règles actives sur la page affichée</span></article>
      <article className="pad-feature-card"><span className="pad-feature-number">02</span><strong>{loading ? "…" : draftCount}</strong><span>Brouillons sur la page affichée</span></article>
      <article className="pad-feature-card"><span className="pad-feature-number">03</span><strong>MULTI</strong><span>Moteur conçu pour plusieurs juridictions</span></article>
    </div>
    <div className="pta-filters">
      <label>Recherche<input value={search} onChange={(event) => { setSearch(event.target.value); setPageNumber(1); }} placeholder="Code ou nom de règle"/></label>
      <label>Catégorie<select value={taxType} onChange={(event) => { setTaxType(event.target.value); setPageNumber(1); }}>{taxTypes.map((value) => <option key={value} value={value}>{value || "Toutes les catégories"}</option>)}</select></label>
      <label>Statut<select value={status} onChange={(event) => { setStatus(event.target.value); setPageNumber(1); }}><option value="">Tous les statuts</option><option value="DRAFT">Brouillon</option><option value="ACTIVE">Active</option><option value="RETIRED">Retirée</option></select></label>
    </div>
    <div className="pad-panel">
      <div className="pad-panel-heading"><div><h2>Règles fiscales</h2><p>Référentiel global · version et période d'application visibles</p></div><ShieldCheck size={18}/></div>
      {error ? <div className="pad-inline-error" role="alert"><AlertCircle size={16}/>{error}<button className="pad-refresh-button" onClick={() => setRefreshKey((value) => value + 1)}>Réessayer</button></div>
      : loading ? <div className="pad-empty-row">Chargement des règles fiscales…</div>
      : !page || page.items.length === 0 ? <div className="pad-empty-row">Aucune règle globale ne correspond aux filtres. Aucune donnée fictive n'est affichée.</div>
      : <><div className="pad-table-scroll"><table className="pad-table"><thead><tr><th>Règle</th><th>Juridiction</th><th>Catégorie</th><th>Traitement</th><th>Taux</th><th>Validité</th><th>Version</th><th>Statut</th></tr></thead><tbody>
        {page.items.map((item) => <tr key={item.id}><td><strong>{item.name}</strong><small>{item.ruleCode}</small></td><td><small>{item.jurisdictionId}</small></td><td>{item.taxType}</td><td>{item.treatment}</td><td>{item.ratePercent}%</td><td>{item.validFrom}{item.validTo ? ` → ${item.validTo}` : " → …"}</td><td>v{item.version}</td><td><span className={`pad-status ${item.status.toLowerCase()}`}>{statusLabels[item.status]}</span></td></tr>)}
      </tbody></table></div><div className="pta-pagination"><span>Page {page.page} · {page.items.length} résultat(s)</span><div><button className="pad-refresh-button" disabled={pageNumber <= 1 || loading} onClick={() => setPageNumber((value) => Math.max(1, value - 1))}>Précédent</button><button className="pad-refresh-button" disabled={!page.hasMore || loading} onClick={() => setPageNumber((value) => value + 1)}>Suivant</button></div></div></>}
    </div>
    <div className="pad-module-note"><ShieldCheck size={17}/><p>Cette première étape est volontairement en lecture seule. La création, la validation, la publication et la modification des règles globales nécessitent des fonctions SQL dédiées, des permissions et un journal d'audit qui seront soumis à validation avant toute migration.</p></div>
  </section>;
}
