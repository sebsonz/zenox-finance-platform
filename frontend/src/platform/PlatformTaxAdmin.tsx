import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  AlertCircle, CheckCircle2, ClipboardCheck, FilePlus2, Globe2, History,
  RefreshCw, Save, Send, ShieldCheck, XCircle, Layers3, PencilLine,
} from "lucide-react";

type TaxRule = {
  id: string; jurisdictionId: string; ruleCode: string; name: string;
  taxType: string; treatment: string; ratePercent: string; priceMode: string;
  priority: number; isCompound: boolean; appliesTo: string; version: number;
  validFrom: string; validTo: string | null; status: "DRAFT" | "ACTIVE" | "RETIRED";
  sourceReference: string | null; sourceUrl: string | null;
  accountingTreatment: string; applicabilityConditions: { schemaVersion: 1; all: unknown[] };
};
type Page<T> = { items: T[]; page: number; pageSize: number; hasMore: boolean; scope?: "GLOBAL" };
type JurisdictionList = { items: Jurisdiction[]; total: number; scope: "GLOBAL" };
type Jurisdiction = {
  id: string; code: string; countryCode: string; name: string;
  jurisdictionLevel: string; parentId: string | null; isActive: boolean;
  createdAt: string; updatedAt: string;
};
type Approval = {
  approval_id: string; rule_id: string; version: number; status: string;
  submitted_by_issuer: string; submitted_by_subject: string;
  reviewed_by_issuer: string | null; reviewed_by_subject: string | null;
  reviewed_at: string | null; decision_reason: string | null; submitted_at: string;
  jurisdiction_id: string; jurisdiction_code: string; country_code: string;
  rule_code: string; name: string; tax_type: string; treatment: string;
  rate_percent: string; price_mode: string; applies_to: string;
  accounting_treatment: string; valid_from: string; valid_to: string | null;
  source_reference: string | null; source_url: string | null;
};
type JurisdictionLevel = {
  id: string; country_code: string; level_code: string; label: string;
  parent_level_code: string | null; sort_order: number; is_required: boolean; is_active: boolean;
};
type AuditEvent = {
  id: string; actor_issuer: string; actor_subject: string; action: string;
  resource_type: string; resource_id: string | null; correlation_id: string;
  reason: string | null; safe_metadata: Record<string, unknown>; created_at: string;
};
type Payload<T> = { data?: T; error?: { message?: string } };
type Tab = "rules" | "approvals" | "jurisdictions" | "levels" | "audit";
const taxTypes = ["VAT", "GST", "SALES_TAX", "EXCISE", "WITHHOLDING", "CUSTOMS_DUTY", "IMPORT_TAX", "ENVIRONMENTAL", "STAMP_DUTY", "OTHER"];
const treatments = ["STANDARD", "REDUCED", "ZERO_RATED", "EXEMPT", "REVERSE_CHARGE", "WITHHOLDING"];
const accountingTreatments = ["TAX_CHARGED", "WITHHOLDING_DEDUCTION", "ADVANCE_INCOME_TAX", "RECOVERABLE_CREDIT", "NON_RECOVERABLE_COST", "CUSTOMS_COST", "OTHER"];
const appliesToValues = ["GOODS", "SERVICES", "DIGITAL_SERVICES", "FREIGHT", "INSURANCE", "ALL"];
const statusLabels: Record<string, string> = { DRAFT: "Brouillon", ACTIVE: "Active", RETIRED: "Retirée", PENDING_REVIEW: "À valider", APPROVED: "Approuvée", REJECTED: "Rejetée", CANCELLED: "Annulée" };
const today = () => new Date().toISOString().slice(0, 10);
const emptyRule = (jurisdictionId = "") => ({
  jurisdictionId, ruleCode: "", name: "", taxType: "VAT", treatment: "STANDARD",
  ratePercent: "18", priceMode: "EXCLUSIVE", priority: "100", isCompound: false,
  appliesTo: "ALL", sourceReference: "", sourceUrl: "", validFrom: today(), validTo: "",
  accountingTreatment: "TAX_CHARGED",
  applicabilityConditions: JSON.stringify({ schemaVersion: 1, all: [] }, null, 2),
  reason: "Création ou nouvelle version de la règle fiscale",
});
const emptyJurisdiction = () => ({
  id: "", code: "", countryCode: "BJ", name: "", levelCode: "COUNTRY",
  parentId: "", isActive: true, reason: "Création ou mise à jour du référentiel juridictionnel",
});
const emptyLevel = () => ({
  countryCode: "BJ", levelCode: "", label: "", parentLevelCode: "",
  sortOrder: "0", isRequired: true, isActive: true,
  reason: "Configuration du niveau de juridiction",
});

async function readPayload<T>(response: Response, fallback: string): Promise<T> {
  const payload = await response.json().catch(() => ({})) as Payload<T>;
  if (!response.ok || payload.data === undefined) throw new Error(payload.error?.message ?? fallback);
  return payload.data;
}
async function apiGet<T>(path: string, fallback: string): Promise<T> {
  return readPayload<T>(await fetch(path, { credentials: "same-origin", cache: "no-store" }), fallback);
}
async function apiPost<T>(path: string, body: unknown, fallback: string): Promise<T> {
  return readPayload<T>(await fetch(path, {
    method: "POST", credentials: "same-origin",
    headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }), fallback);
}
function Status({ value }: { value: string }) {
  return <span className={`pta-status pta-status-${value.toLowerCase()}`}>{statusLabels[value] ?? value}</span>;
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="pta-field"><span>{label}</span>{children}</label>;
}
function ErrorLine({ children }: { children: ReactNode }) {
  return <div className="pta-error" role="alert"><AlertCircle size={15}/>{children}</div>;
}

export function PlatformTaxAdmin() {
  const [tab, setTab] = useState<Tab>("rules");
  const [rules, setRules] = useState<Page<TaxRule> | null>(null);
  const [jurisdictions, setJurisdictions] = useState<JurisdictionList | null>(null);
  const [approvals, setApprovals] = useState<Page<Approval> | null>(null);
  const [audit, setAudit] = useState<Page<AuditEvent> | null>(null);
  const [levels, setLevels] = useState<JurisdictionLevel[]>([]);
  const [selectedCountry, setSelectedCountry] = useState("BJ");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [search, setSearch] = useState("");
  const [ruleStatus, setRuleStatus] = useState("");
  const [ruleType, setRuleType] = useState("");
  const [approvalStatus, setApprovalStatus] = useState("PENDING_REVIEW");
  const [ruleFormOpen, setRuleFormOpen] = useState(false);
  const [ruleForm, setRuleForm] = useState(emptyRule());
  const [jurisdictionFormOpen, setJurisdictionFormOpen] = useState(false);
  const [jurisdictionForm, setJurisdictionForm] = useState(emptyJurisdiction());
  const [levelFormOpen, setLevelFormOpen] = useState(false);
  const [levelForm, setLevelForm] = useState(emptyLevel());
  const [reviewTarget, setReviewTarget] = useState<Approval | null>(null);
  const [reviewDecision, setReviewDecision] = useState<"APPROVE" | "REJECT">("APPROVE");
  const [reviewReason, setReviewReason] = useState("");

  const refresh = useCallback(() => setRefreshKey((value) => value + 1), []);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ page: "1", pageSize: "50" });
    if (search.trim()) params.set("search", search.trim());
    if (ruleStatus) params.set("status", ruleStatus);
    if (ruleType) params.set("taxType", ruleType);
    const approvalParams = new URLSearchParams({ page: "1", pageSize: "50" });
    if (approvalStatus) approvalParams.set("status", approvalStatus);
    const auditParams = new URLSearchParams({ page: "1", pageSize: "50" });
    try {
      const results = await Promise.allSettled([
        apiGet<Page<TaxRule>>(`/api/v1/user/platform/tax/rules?${params}`, "Impossible de charger les règles."),
        apiGet<JurisdictionList>("/api/v1/user/platform/tax/jurisdictions", "Impossible de charger les juridictions."),
        apiGet<Page<Approval>>(`/api/v1/user/platform/tax/approvals?${approvalParams}`, "Impossible de charger la file de validation."),
        apiGet<Page<AuditEvent>>(`/api/v1/user/platform/tax/audit?${auditParams}`, "Impossible de charger le journal fiscal."),
        apiGet<{ items: JurisdictionLevel[] }>(`/api/v1/user/platform/tax/jurisdiction-levels?countryCode=${selectedCountry}`, "Impossible de charger les niveaux juridictionnels."),
      ]);
      const [ruleResult, jurisdictionResult, approvalResult, auditResult, levelResult] = results;
      if (ruleResult.status === "fulfilled") setRules(ruleResult.value);
      if (jurisdictionResult.status === "fulfilled") setJurisdictions(jurisdictionResult.value);
      if (approvalResult.status === "fulfilled") setApprovals(approvalResult.value);
      if (auditResult.status === "fulfilled") setAudit(auditResult.value);
      if (levelResult.status === "fulfilled") setLevels(levelResult.value.items);
      const failures = results.filter((item) => item.status === "rejected") as PromiseRejectedResult[];
      if (failures.length) setError(failures.map((item) => item.reason instanceof Error ? item.reason.message : "Une section n’a pas pu être chargée.").join(" · "));
    } finally { setLoading(false); }
  }, [search, ruleStatus, ruleType, approvalStatus, selectedCountry]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  const activeCount = rules?.items.filter((rule) => rule.status === "ACTIVE").length ?? 0;
  const pendingCount = approvals?.items.filter((approval) => approval.status === "PENDING_REVIEW").length ?? 0;
  const activeJurisdictions = jurisdictions?.items.filter((item) => item.isActive).length ?? 0;
  const selectedJurisdiction = jurisdictions?.items.find((item) => item.countryCode === selectedCountry && item.isActive) ?? null;
  const parentOptions = useMemo(() => jurisdictions?.items.filter((item) =>
    item.countryCode === jurisdictionForm.countryCode && item.id !== jurisdictionForm.id && item.isActive) ?? [], [jurisdictions, jurisdictionForm.countryCode, jurisdictionForm.id]);

  async function createRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    let applicabilityConditions: { schemaVersion: 1; all: unknown[] };
    try { applicabilityConditions = JSON.parse(ruleForm.applicabilityConditions) as { schemaVersion: 1; all: unknown[] }; }
    catch { setError("Le JSON des conditions d’applicabilité est invalide."); return; }
    setSaving(true); setError(""); setNotice("");
    try {
      const { reason, applicabilityConditions: _conditions, priority, validTo, sourceUrl, ...fields } = ruleForm;
      const data = await apiPost<{ id: string; status: string; scope: string }>("/api/v1/user/platform/tax/rules", {
        rule: { ...fields, priority: Number(priority), applicabilityConditions, ...(validTo ? { validTo } : {}), ...(sourceUrl.trim() ? { sourceUrl: sourceUrl.trim() } : {}) },
        reason,
      }, "La création du brouillon a échoué.");
      setNotice(`Brouillon global créé (${data.id}). Il doit être soumis puis approuvé par un autre opérateur avant activation.`);
      setRuleFormOpen(false); setRuleForm(emptyRule(ruleForm.jurisdictionId)); refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "La création a échoué."); }
    finally { setSaving(false); }
  }

  function startNewVersion(rule: TaxRule) {
    setRuleForm({
      ...emptyRule(rule.jurisdictionId),
      ruleCode: rule.ruleCode, name: rule.name, taxType: rule.taxType,
      treatment: rule.treatment, ratePercent: rule.ratePercent, priceMode: rule.priceMode,
      priority: String(rule.priority), isCompound: rule.isCompound, appliesTo: rule.appliesTo,
      sourceReference: rule.sourceReference ?? "", sourceUrl: rule.sourceUrl ?? "",
      validFrom: rule.validFrom, validTo: rule.validTo ?? "",
      accountingTreatment: rule.accountingTreatment,
      applicabilityConditions: JSON.stringify(rule.applicabilityConditions, null, 2),
      reason: `Création d’une nouvelle version de ${rule.ruleCode}`,
    });
    setRuleFormOpen(true); setTab("rules");
  }

  async function submitRule(ruleId: string) {
    setSaving(true); setError(""); setNotice("");
    try {
      const data = await apiPost<{ approvalId: string }>(`/api/v1/user/platform/tax/rules/${ruleId}/submit`, {}, "La soumission a échoué.");
      setNotice(`Règle soumise à validation. Référence de revue : ${data.approvalId}`);
      refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "La soumission a échoué."); }
    finally { setSaving(false); }
  }

  async function reviewApproval(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reviewTarget || saving) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const data = await apiPost<{ status: string }>(`/api/v1/user/platform/tax/approvals/${reviewTarget.approval_id}/review`, {
        decision: reviewDecision, reason: reviewReason,
      }, "La revue a échoué.");
      setNotice(data.status === "APPROVED" ? "Règle approuvée et activée." : "Règle rejetée. Le motif est conservé dans l’historique.");
      setReviewTarget(null); setReviewReason(""); refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "La revue a échoué."); }
    finally { setSaving(false); }
  }

  async function saveJurisdiction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const data = await apiPost<{ id: string }>("/api/v1/user/platform/tax/jurisdictions", {
        ...jurisdictionForm, id: jurisdictionForm.id || null, parentId: jurisdictionForm.parentId || null,
      }, "L’enregistrement de la juridiction a échoué.");
      setNotice(`Juridiction enregistrée : ${data.id}`);
      setJurisdictionFormOpen(false); setJurisdictionForm(emptyJurisdiction()); refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "L’enregistrement a échoué."); }
    finally { setSaving(false); }
  }

  async function saveLevel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const data = await apiPost<{ id: string }>("/api/v1/user/platform/tax/jurisdiction-levels", {
        ...levelForm, sortOrder: Number(levelForm.sortOrder), parentLevelCode: levelForm.parentLevelCode || null,
      }, "L’enregistrement du niveau a échoué.");
      setNotice(`Niveau juridictionnel enregistré : ${data.id}`);
      setLevelFormOpen(false); setLevelForm(emptyLevel()); refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "L’enregistrement a échoué."); }
    finally { setSaving(false); }
  }

  return <section className="pad-module pta-workspace">
    <header className="pta-header">
      <div><div className="pta-eyebrow"><ShieldCheck size={14}/> CONTRÔLE FISCAL CENTRAL</div><h2>Administration fiscale globale</h2><p>Référentiels juridictionnels, règles versionnées, workflow à double contrôle et traçabilité des décisions.</p></div>
      <button className="pad-refresh-button" onClick={refresh} disabled={loading || saving}><RefreshCw size={14}/> Actualiser</button>
    </header>
    <div className="pta-kpis">
      <article><span>Juridictions actives</span><strong>{jurisdictions ? activeJurisdictions : "—"}</strong><small>Référentiel global</small></article>
      <article><span>Règles actives</span><strong>{rules ? activeCount : "—"}</strong><small>Versions publiées</small></article>
      <article><span>À valider</span><strong>{approvals ? pendingCount : "—"}</strong><small>Double contrôle obligatoire</small></article>
      <article><span>Portée</span><strong>MULTI</strong><small>Multi-pays et multi-juridictions</small></article>
    </div>
    <nav className="pta-tabs" aria-label="Sections de l’administration fiscale">
      {([
        ["rules", "Règles fiscales", Layers3],
        ["approvals", "Approbations", ClipboardCheck],
        ["jurisdictions", "Juridictions", Globe2],
        ["levels", "Niveaux", Layers3],
        ["audit", "Journal d’audit", History],
      ] as const).map(([id, label, Icon]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}><Icon size={15}/>{label}{id === "approvals" && pendingCount > 0 && <b>{pendingCount}</b>}</button>)}
    </nav>
    {error && <ErrorLine>{error}</ErrorLine>}
    {notice && <div className="pta-notice" role="status"><CheckCircle2 size={15}/>{notice}<button onClick={() => setNotice("")} aria-label="Fermer"><XCircle size={15}/></button></div>}

    {tab === "rules" && <section className="pta-panel">
      <div className="pta-panel-head"><div><h3>Référentiel des règles globales</h3><p>Les règles approuvées deviennent actives. Toute évolution se fait par une nouvelle version.</p></div><button className="pad-refresh-button pta-primary" onClick={() => { setRuleForm(emptyRule(selectedJurisdiction?.id ?? "")); setRuleFormOpen((value) => !value); }}><FilePlus2 size={15}/> Nouvelle règle</button></div>
      <div className="pta-filters">
        <Field label="Recherche"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Code ou libellé"/></Field>
        <Field label="Type de taxe"><select value={ruleType} onChange={(e) => setRuleType(e.target.value)}><option value="">Tous les types</option>{taxTypes.map((value) => <option key={value}>{value}</option>)}</select></Field>
        <Field label="Statut"><select value={ruleStatus} onChange={(e) => setRuleStatus(e.target.value)}><option value="">Tous les statuts</option><option value="DRAFT">Brouillon</option><option value="ACTIVE">Active</option><option value="RETIRED">Retirée</option></select></Field>
      </div>
      {ruleFormOpen && <form className="pta-form" onSubmit={(e) => void createRule(e)}>
        <div className="pta-form-head"><div><strong>Créer un brouillon fiscal global</strong><small>Version et statut attribués côté serveur. Source légale obligatoire.</small></div><button type="button" className="pta-close" onClick={() => setRuleFormOpen(false)}><XCircle size={17}/></button></div>
        <div className="pta-form-grid">
          <Field label="Juridiction *"><select required value={ruleForm.jurisdictionId} onChange={(e) => setRuleForm((v) => ({ ...v, jurisdictionId: e.target.value }))}><option value="">Sélectionner…</option>{jurisdictions?.items.filter((j) => j.isActive).map((j) => <option key={j.id} value={j.id}>{j.countryCode} · {j.name} ({j.code})</option>)}</select></Field>
          <Field label="Code de règle *"><input required minLength={2} maxLength={80} pattern="[A-Za-z0-9][A-Za-z0-9_.:-]+" value={ruleForm.ruleCode} onChange={(e) => setRuleForm((v) => ({ ...v, ruleCode: e.target.value.toUpperCase() }))} placeholder="BJ_VAT_STANDARD"/></Field>
          <Field label="Libellé *"><input required maxLength={160} value={ruleForm.name} onChange={(e) => setRuleForm((v) => ({ ...v, name: e.target.value }))}/></Field>
          <Field label="Type de taxe"><select value={ruleForm.taxType} onChange={(e) => setRuleForm((v) => ({ ...v, taxType: e.target.value, treatment: e.target.value === "WITHHOLDING" ? "WITHHOLDING" : v.treatment }))}>{taxTypes.map((value) => <option key={value}>{value}</option>)}</select></Field>
          <Field label="Traitement"><select value={ruleForm.treatment} onChange={(e) => setRuleForm((v) => ({ ...v, treatment: e.target.value }))}>{treatments.map((value) => <option key={value}>{value}</option>)}</select></Field>
          <Field label="Taux (%) *"><input required inputMode="decimal" pattern="(?:0|[1-9][0-9]{0,2})(?:\.[0-9]{1,6})?" value={ruleForm.ratePercent} onChange={(e) => setRuleForm((v) => ({ ...v, ratePercent: e.target.value }))}/></Field>
          <Field label="Mode de prix"><select value={ruleForm.priceMode} onChange={(e) => setRuleForm((v) => ({ ...v, priceMode: e.target.value }))}><option value="EXCLUSIVE">HT — taxe ajoutée</option><option value="INCLUSIVE">TTC — taxe incluse</option></select></Field>
          <Field label="Applicable à"><select value={ruleForm.appliesTo} onChange={(e) => setRuleForm((v) => ({ ...v, appliesTo: e.target.value }))}>{appliesToValues.map((value) => <option key={value}>{value}</option>)}</select></Field>
          <Field label="Traitement comptable"><select value={ruleForm.accountingTreatment} onChange={(e) => setRuleForm((v) => ({ ...v, accountingTreatment: e.target.value }))}>{accountingTreatments.map((value) => <option key={value}>{value}</option>)}</select></Field>
          <Field label="Priorité"><input type="number" min="0" max="10000" value={ruleForm.priority} onChange={(e) => setRuleForm((v) => ({ ...v, priority: e.target.value }))}/></Field>
          <Field label="Valide à partir du *"><input type="date" required value={ruleForm.validFrom} onChange={(e) => setRuleForm((v) => ({ ...v, validFrom: e.target.value }))}/></Field>
          <Field label="Valide jusqu’au"><input type="date" min={ruleForm.validFrom} value={ruleForm.validTo} onChange={(e) => setRuleForm((v) => ({ ...v, validTo: e.target.value }))}/></Field>
          <Field label="Référence légale *"><input required minLength={1} maxLength={500} value={ruleForm.sourceReference} onChange={(e) => setRuleForm((v) => ({ ...v, sourceReference: e.target.value }))} placeholder="Code, loi, article, décret…"/></Field>
          <Field label="URL de la source"><input type="url" maxLength={2000} value={ruleForm.sourceUrl} onChange={(e) => setRuleForm((v) => ({ ...v, sourceUrl: e.target.value }))} placeholder="https://…"/></Field>
        </div>
        <Field label="Conditions d’applicabilité (JSON strict)"><textarea rows={5} spellCheck={false} value={ruleForm.applicabilityConditions} onChange={(e) => setRuleForm((v) => ({ ...v, applicabilityConditions: e.target.value }))}/></Field>
        <div className="pta-form-row"><label className="pta-check"><input type="checkbox" checked={ruleForm.isCompound} onChange={(e) => setRuleForm((v) => ({ ...v, isCompound: e.target.checked }))}/> Taxe composée</label><Field label="Motif d’audit *"><input required minLength={10} maxLength={1000} value={ruleForm.reason} onChange={(e) => setRuleForm((v) => ({ ...v, reason: e.target.value }))}/></Field><button className="pta-primary" disabled={saving}><Save size={15}/>{saving ? "Enregistrement…" : "Créer le brouillon"}</button></div>
      </form>}
      {loading && !rules ? <div className="pta-empty">Chargement des règles…</div> : !rules?.items.length ? <div className="pta-empty">Aucune règle globale ne correspond aux critères. Aucune donnée de démonstration n’est affichée.</div> :
      <div className="pta-table-wrap"><table className="pad-table"><thead><tr><th>Règle</th><th>Juridiction</th><th>Type / traitement</th><th>Taux</th><th>Comptabilité</th><th>Validité</th><th>Version</th><th>Statut</th><th>Actions</th></tr></thead><tbody>{rules.items.map((rule) => <tr key={rule.id}>
        <td><strong>{rule.name}</strong><small>{rule.ruleCode}</small></td><td>{jurisdictions?.items.find((j) => j.id === rule.jurisdictionId)?.code ?? rule.jurisdictionId.slice(0, 8)}</td><td>{rule.taxType}<small>{rule.treatment}</small></td><td>{rule.ratePercent}%<small>{rule.priceMode}</small></td><td>{rule.accountingTreatment}</td><td>{rule.validFrom}{rule.validTo ? ` → ${rule.validTo}` : " → ∞"}</td><td>v{rule.version}</td><td><Status value={rule.status}/></td><td><div className="pta-actions">{rule.status === "DRAFT" && <button onClick={() => void submitRule(rule.id)} disabled={saving} title="Soumettre à validation"><Send size={14}/> Soumettre</button>}<button onClick={() => startNewVersion(rule)} title="Créer une nouvelle version"><PencilLine size={14}/> Nouvelle version</button></div></td>
      </tr>)}</tbody></table></div>}
    </section>}

    {tab === "approvals" && <section className="pta-panel">
      <div className="pta-panel-head"><div><h3>Workflow de validation à double contrôle</h3><p>L’auteur ne peut pas approuver sa propre soumission. L’autorisation de revue est contrôlée par PostgreSQL.</p></div><Field label="État"><select value={approvalStatus} onChange={(e) => setApprovalStatus(e.target.value)}><option value="PENDING_REVIEW">À valider</option><option value="APPROVED">Approuvées</option><option value="REJECTED">Rejetées</option><option value="CANCELLED">Annulées</option></select></Field></div>
      {reviewTarget && <form className="pta-review-form" onSubmit={(e) => void reviewApproval(e)}><div><strong>Revue de {reviewTarget.rule_code} · v{reviewTarget.version}</strong><small>{reviewTarget.name} — {reviewTarget.jurisdiction_code}</small></div><Field label="Décision"><select value={reviewDecision} onChange={(e) => setReviewDecision(e.target.value as "APPROVE" | "REJECT")}><option value="APPROVE">Approuver et activer</option><option value="REJECT">Rejeter</option></select></Field><Field label={reviewDecision === "REJECT" ? "Motif de rejet obligatoire (10–1000 caractères)" : "Note de revue (facultative)"}><textarea rows={2} value={reviewReason} onChange={(e) => setReviewReason(e.target.value)} maxLength={1000}/></Field><div className="pta-actions"><button className="pta-primary" disabled={saving || (reviewDecision === "REJECT" && reviewReason.trim().length < 10)}>{saving ? "Traitement…" : "Confirmer la décision"}</button><button type="button" onClick={() => setReviewTarget(null)}>Annuler</button></div></form>}
      {!approvals?.items.length ? <div className="pta-empty">Aucune demande pour ce filtre.</div> : <div className="pta-table-wrap"><table className="pad-table"><thead><tr><th>Règle / version</th><th>Juridiction</th><th>Type</th><th>Taux</th><th>Soumise le</th><th>Statut</th><th>Décision / actions</th></tr></thead><tbody>{approvals.items.map((item) => <tr key={item.approval_id}><td><strong>{item.name}</strong><small>{item.rule_code} · v{item.version}</small></td><td>{item.jurisdiction_code} ({item.country_code})</td><td>{item.tax_type}</td><td>{item.rate_percent}%</td><td>{new Date(item.submitted_at).toLocaleString("fr-FR")}</td><td><Status value={item.status}/></td><td>{item.status === "PENDING_REVIEW" ? <button className="pta-action-link" onClick={() => { setReviewTarget(item); setReviewDecision("APPROVE"); setReviewReason(""); }}>Examiner</button> : <small>{item.decision_reason || (item.reviewed_at ? new Date(item.reviewed_at).toLocaleString("fr-FR") : "—")}</small>}</td></tr>)}</tbody></table></div>}
    </section>}

    {tab === "jurisdictions" && <section className="pta-panel">
      <div className="pta-panel-head"><div><h3>Référentiel des juridictions</h3><p>Hiérarchie géographique globale : pays, régions, départements, communes et niveaux configurés par pays.</p></div><button className="pta-primary" onClick={() => { setJurisdictionForm(emptyJurisdiction()); setJurisdictionFormOpen((v) => !v); }}><FilePlus2 size={15}/> Nouvelle juridiction</button></div>
      {jurisdictionFormOpen && <form className="pta-form" onSubmit={(e) => void saveJurisdiction(e)}><div className="pta-form-head"><strong>{jurisdictionForm.id ? "Modifier la juridiction" : "Créer une juridiction"}</strong><button type="button" className="pta-close" onClick={() => setJurisdictionFormOpen(false)}><XCircle size={17}/></button></div><div className="pta-form-grid">
        <Field label="Code juridiction *"><input required value={jurisdictionForm.code} onChange={(e) => setJurisdictionForm((v) => ({ ...v, code: e.target.value.toUpperCase() }))} maxLength={80} placeholder="BJ"/></Field>
        <Field label="Pays ISO-2 *"><input required pattern="[A-Z]{2}" maxLength={2} value={jurisdictionForm.countryCode} onChange={(e) => setJurisdictionForm((v) => ({ ...v, countryCode: e.target.value.toUpperCase() }))}/></Field>
        <Field label="Nom *"><input required maxLength={160} value={jurisdictionForm.name} onChange={(e) => setJurisdictionForm((v) => ({ ...v, name: e.target.value }))}/></Field>
        <Field label="Niveau *"><select required value={jurisdictionForm.levelCode} onChange={(e) => setJurisdictionForm((v) => ({ ...v, levelCode: e.target.value }))}><option value="">Sélectionner…</option>{levels.filter((l) => l.is_active).map((l) => <option key={l.id} value={l.level_code}>{l.label} ({l.level_code})</option>)}</select></Field>
        <Field label="Juridiction parente"><select value={jurisdictionForm.parentId} onChange={(e) => setJurisdictionForm((v) => ({ ...v, parentId: e.target.value }))}><option value="">Aucune (racine)</option>{parentOptions.map((j) => <option key={j.id} value={j.id}>{j.code} · {j.name}</option>)}</select></Field>
        <Field label="Motif d’audit *"><input required minLength={10} maxLength={1000} value={jurisdictionForm.reason} onChange={(e) => setJurisdictionForm((v) => ({ ...v, reason: e.target.value }))}/></Field>
      </div><label className="pta-check"><input type="checkbox" checked={jurisdictionForm.isActive} onChange={(e) => setJurisdictionForm((v) => ({ ...v, isActive: e.target.checked }))}/> Juridiction active</label><div className="pta-form-actions"><button className="pta-primary" disabled={saving}><Save size={15}/> Enregistrer</button></div></form>}
      {!jurisdictions?.items.length ? <div className="pta-empty">Aucune juridiction référencée.</div> : <div className="pta-table-wrap"><table className="pad-table"><thead><tr><th>Code</th><th>Nom</th><th>Pays</th><th>Niveau</th><th>Parent</th><th>État</th><th>Actions</th></tr></thead><tbody>{jurisdictions.items.map((j) => <tr key={j.id}><td><strong>{j.code}</strong></td><td>{j.name}</td><td>{j.countryCode}</td><td>{j.jurisdictionLevel}</td><td>{jurisdictions.items.find((p) => p.id === j.parentId)?.code ?? "—"}</td><td><Status value={j.isActive ? "ACTIVE" : "RETIRED"}/></td><td><button className="pta-action-link" onClick={() => { setJurisdictionForm({ id: j.id, code: j.code, countryCode: j.countryCode, name: j.name, levelCode: j.jurisdictionLevel, parentId: j.parentId ?? "", isActive: j.isActive, reason: "Mise à jour de la juridiction et journalisation du changement" }); setSelectedCountry(j.countryCode); setJurisdictionFormOpen(true); }}>Modifier</button></td></tr>)}</tbody></table></div>}
    </section>}

    {tab === "levels" && <section className="pta-panel">
      <div className="pta-panel-head"><div><h3>Modèles de hiérarchie par pays</h3><p>Définissez les niveaux autorisés et leurs relations parent-enfant avant de créer les juridictions.</p></div><div className="pta-inline-tools"><Field label="Pays"><input maxLength={2} pattern="[A-Z]{2}" value={selectedCountry} onChange={(e) => setSelectedCountry(e.target.value.toUpperCase())}/></Field><button className="pta-primary" onClick={() => { setLevelForm({ ...emptyLevel(), countryCode: selectedCountry }); setLevelFormOpen((v) => !v); }}><FilePlus2 size={15}/> Ajouter niveau</button></div></div>
      {levelFormOpen && <form className="pta-form" onSubmit={(e) => void saveLevel(e)}><div className="pta-form-grid">
        <Field label="Pays ISO-2"><input required pattern="[A-Z]{2}" value={levelForm.countryCode} onChange={(e) => setLevelForm((v) => ({ ...v, countryCode: e.target.value.toUpperCase() }))}/></Field>
        <Field label="Code niveau *"><input required pattern="[A-Z][A-Z0-9_]{1,39}" value={levelForm.levelCode} onChange={(e) => setLevelForm((v) => ({ ...v, levelCode: e.target.value.toUpperCase() }))} placeholder="DEPARTMENT"/></Field>
        <Field label="Libellé *"><input required maxLength={100} value={levelForm.label} onChange={(e) => setLevelForm((v) => ({ ...v, label: e.target.value }))}/></Field>
        <Field label="Niveau parent"><select value={levelForm.parentLevelCode} onChange={(e) => setLevelForm((v) => ({ ...v, parentLevelCode: e.target.value }))}><option value="">Aucun</option>{levels.filter((l) => l.is_active).map((l) => <option key={l.id} value={l.level_code}>{l.label} ({l.level_code})</option>)}</select></Field>
        <Field label="Ordre"><input type="number" min="0" max="10000" value={levelForm.sortOrder} onChange={(e) => setLevelForm((v) => ({ ...v, sortOrder: e.target.value }))}/></Field>
        <Field label="Motif d’audit *"><input required minLength={10} maxLength={1000} value={levelForm.reason} onChange={(e) => setLevelForm((v) => ({ ...v, reason: e.target.value }))}/></Field>
      </div><div className="pta-form-row"><label className="pta-check"><input type="checkbox" checked={levelForm.isRequired} onChange={(e) => setLevelForm((v) => ({ ...v, isRequired: e.target.checked }))}/> Niveau requis</label><label className="pta-check"><input type="checkbox" checked={levelForm.isActive} onChange={(e) => setLevelForm((v) => ({ ...v, isActive: e.target.checked }))}/> Actif</label><button className="pta-primary" disabled={saving}><Save size={15}/> Enregistrer le niveau</button></div></form>}
      {!levels.length ? <div className="pta-empty">Aucun niveau configuré pour {selectedCountry}. Configurez d’abord le modèle hiérarchique du pays.</div> : <div className="pta-table-wrap"><table className="pad-table"><thead><tr><th>Code</th><th>Libellé</th><th>Parent</th><th>Ordre</th><th>Requis</th><th>Statut</th></tr></thead><tbody>{levels.map((l) => <tr key={l.id}><td><strong>{l.level_code}</strong></td><td>{l.label}</td><td>{l.parent_level_code ?? "—"}</td><td>{l.sort_order}</td><td>{l.is_required ? "Oui" : "Non"}</td><td><Status value={l.is_active ? "ACTIVE" : "RETIRED"}/></td></tr>)}</tbody></table></div>}
    </section>}

    {tab === "audit" && <section className="pta-panel"><div className="pta-panel-head"><div><h3>Journal d’audit fiscal</h3><p>Événements de création, soumission, décision et modification des juridictions.</p></div><History size={18}/></div>
      {!audit?.items.length ? <div className="pta-empty">Aucun événement fiscal ne correspond à cette vue.</div> : <div className="pta-table-wrap"><table className="pad-table"><thead><tr><th>Date</th><th>Action</th><th>Ressource</th><th>Acteur</th><th>Motif</th><th>Corrélation</th></tr></thead><tbody>{audit.items.map((event) => <tr key={event.id}><td>{new Date(event.created_at).toLocaleString("fr-FR")}</td><td><strong>{event.action}</strong></td><td>{event.resource_type}<small>{event.resource_id ?? "—"}</small></td><td><small>{event.actor_issuer}</small><small>{event.actor_subject}</small></td><td>{event.reason ?? "—"}</td><td><small>{event.correlation_id}</small></td></tr>)}</tbody></table></div>}
    </section>}
    <footer className="pta-footnote"><ShieldCheck size={15}/> La base contrôle les permissions, la séparation des auteurs et reviewers, la version soumise et l’activation atomique. Les actions sensibles sont journalisées par les fonctions SQL existantes.</footer>
  </section>;
}
