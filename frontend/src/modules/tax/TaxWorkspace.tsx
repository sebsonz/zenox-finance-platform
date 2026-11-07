import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Activity, CheckCircle2, CircleAlert, FilePlus2, Globe2, RefreshCw, ShieldCheck } from "lucide-react";

type Jurisdiction = { id: string; code: string; countryCode: string; name: string; level: string; parentId: string | null };
type TaxRule = {
  id: string; tenantId: string | null; jurisdictionId: string; jurisdictionCode: string;
  ruleCode: string; name: string; taxType: string; treatment: string; ratePercent: string;
  priceMode: string; priority: number; isCompound: boolean; appliesTo: string;
  sourceReference: string | null; sourceUrl: string | null; version: number;
  validFrom: string; validTo: string | null; status: "DRAFT" | "ACTIVE" | "RETIRED";
  scope: "GLOBAL" | "ORGANIZATION";
};
type ApiPayload<T> = { data?: T; error?: { message?: string } };
type Props = { tenantId: string; canManage: boolean };

const emptyForm = (jurisdictionId = "") => ({
  jurisdictionId, ruleCode: "", name: "", taxType: "VAT", treatment: "STANDARD",
  ratePercent: "18", priceMode: "EXCLUSIVE", priority: "100", isCompound: false,
  appliesTo: "ALL", sourceReference: "", sourceUrl: "",
  validFrom: new Date().toISOString().slice(0, 10), validTo: "",
});

async function readPayload<T>(response: Response, fallback: string): Promise<T> {
  const payload = await response.json().catch(() => ({})) as ApiPayload<T>;
  if (!response.ok || payload.data === undefined) throw new Error(payload.error?.message ?? fallback);
  return payload.data;
}

export function TaxWorkspace({ tenantId, canManage }: Props) {
  const [jurisdictions, setJurisdictions] = useState<Jurisdiction[]>([]);
  const [rules, setRules] = useState<TaxRule[]>([]);
  const [selectedJurisdictionId, setSelectedJurisdictionId] = useState("");
  const [form, setForm] = useState(emptyForm());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [jurisdictionData, ruleData] = await Promise.all([
        fetch(`/api/v1/user/tenants/${tenantId}/tax-jurisdictions`, { credentials: "same-origin", cache: "no-store" })
          .then((response) => readPayload<{ jurisdictions: Jurisdiction[] }>(response, "Impossible de charger les juridictions.")),
        fetch(`/api/v1/user/tenants/${tenantId}/tax-rules`, { credentials: "same-origin", cache: "no-store" })
          .then((response) => readPayload<{ rules: TaxRule[] }>(response, "Impossible de charger les règles fiscales.")),
      ]);
      setJurisdictions(jurisdictionData.jurisdictions ?? []);
      setRules(ruleData.rules ?? []);
      setSelectedJurisdictionId((current) =>
        jurisdictionData.jurisdictions.some((item) => item.id === current)
          ? current
          : jurisdictionData.jurisdictions.find((item) => item.countryCode === "BJ")?.id
            ?? jurisdictionData.jurisdictions[0]?.id ?? "",
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Le centre fiscal n'a pas pu être chargé.");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { void load(); }, [load]);

  const selectedJurisdiction = jurisdictions.find((item) => item.id === selectedJurisdictionId) ?? null;
  const filteredRules = useMemo(
    () => rules.filter((rule) => !selectedJurisdictionId || rule.jurisdictionId === selectedJurisdictionId),
    [rules, selectedJurisdictionId],
  );
  const bjAvailable = jurisdictions.some((item) => item.countryCode === "BJ");

  async function createDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || saving) return;
    if (!form.jurisdictionId) { setError("Sélectionnez une juridiction active."); return; }
    setSaving(true); setError(""); setNotice("");
    try {
      await readPayload<{ rule: TaxRule }>(
        await fetch(`/api/v1/user/tenants/${tenantId}/tax-rules`, {
          method: "POST", credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            jurisdictionId: form.jurisdictionId,
            ruleCode: form.ruleCode.trim().toUpperCase(),
            name: form.name.trim(),
            taxType: form.taxType,
            treatment: form.treatment,
            ratePercent: form.ratePercent,
            priceMode: form.priceMode,
            priority: Number(form.priority),
            isCompound: form.isCompound,
            appliesTo: form.appliesTo,
            ...(form.sourceReference.trim() ? { sourceReference: form.sourceReference.trim() } : {}),
            ...(form.sourceUrl.trim() ? { sourceUrl: form.sourceUrl.trim() } : {}),
            validFrom: form.validFrom,
            ...(form.validTo ? { validTo: form.validTo } : {}),
          }),
        }),
        "Impossible d'enregistrer la règle fiscale.",
      );
      setNotice("Règle enregistrée en brouillon. Elle n'est pas encore utilisée pour calculer ou émettre une facture.");
      setShowForm(false);
      setForm(emptyForm(selectedJurisdictionId));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "La règle fiscale n'a pas été enregistrée.");
    } finally { setSaving(false); }
  }

  return <div className="tax-admin-workspace">
    <div className="welcome-row">
      <div><div className="eyebrow"><Globe2 size={14}/> FISCALITÉ & CONFORMITÉ</div><h1>Centre fiscal</h1><p className="subtitle">Référentiel multi-pays, juridictions et règles fiscales versionnées.</p></div>
      <button className="outline-button" type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={15}/> Actualiser</button>
    </div>

    <div className="demo-banner tax-admin-banner"><div className="demo-icon"><ShieldCheck size={19}/></div><div><strong>Configuration fiscale contrôlée</strong><p>Les règles globales sont en lecture seule. Les règles de cette organisation sont enregistrées en brouillon jusqu'à leur revue et validation.</p></div><span className="demo-pill">MULTI-PAYS</span></div>

    {error && <div className="notice tax-admin-error" role="alert"><CircleAlert size={16}/>{error}</div>}
    {notice && <div className="notice tax-admin-success" role="status"><CheckCircle2 size={16}/>{notice}</div>}

    <section className="tax-admin-stats">
      <article className="panel"><span>Juridictions disponibles</span><strong>{loading ? "…" : jurisdictions.length}</strong><small>Référentiel global actif</small></article>
      <article className="panel"><span>Règles consultables</span><strong>{loading ? "…" : rules.length}</strong><small>Globales et organisation</small></article>
      <article className="panel"><span>Brouillons organisation</span><strong>{loading ? "…" : rules.filter((rule) => rule.scope === "ORGANIZATION" && rule.status === "DRAFT").length}</strong><small>En attente de validation</small></article>
    </section>

    <section className="panel tax-admin-jurisdictions">
      <div className="panel-heading"><div><h2><Globe2 size={18}/> Juridictions</h2><p>Référentiel géographique partagé. La création d'une juridiction globale est réservée à une opération de référence contrôlée.</p></div></div>
      {loading ? <div className="tax-admin-empty">Chargement des juridictions…</div> : jurisdictions.length === 0 ? <div className="tax-admin-empty"><CircleAlert size={20}/><strong>Aucune juridiction active n'est exposée par le référentiel.</strong><p>Le Bénin (BJ) ne peut pas encore être sélectionné. Son enregistrement dans le référentiel global nécessite une validation et une opération de données séparée. Aucune donnée n'a été créée automatiquement.</p></div> : <>
        <div className="tax-admin-filter"><label>Juridiction sélectionnée<select value={selectedJurisdictionId} onChange={(event) => { setSelectedJurisdictionId(event.target.value); setForm(emptyForm(event.target.value)); }}><option value="">Toutes les juridictions</option>{jurisdictions.map((item) => <option key={item.id} value={item.id}>{item.countryCode} · {item.name} ({item.code})</option>)}</select></label></div>
        {!bjAvailable && <p className="tax-admin-warning"><CircleAlert size={15}/> La juridiction BJ n'est pas encore présente dans le référentiel actif.</p>}
        {selectedJurisdiction && <div className="tax-admin-selected"><strong>{selectedJurisdiction.name}</strong><span>{selectedJurisdiction.countryCode} · {selectedJurisdiction.code} · {selectedJurisdiction.level}</span></div>}
      </>}
    </section>

    <section className="panel tax-admin-rules">
      <div className="panel-heading"><div><h2><Activity size={18}/> Règles fiscales</h2><p>Les règles sont datées, versionnées et liées à une juridiction.</p></div><button className="primary-button" type="button" disabled={!canManage || !selectedJurisdictionId || loading} onClick={() => { setForm(emptyForm(selectedJurisdictionId)); setShowForm((value) => !value); }}><FilePlus2 size={15}/> Nouvelle règle</button></div>
      {showForm && <form className="tax-admin-rule-form" onSubmit={(event) => void createDraft(event)}>
        <div className="tax-admin-form-heading"><strong>Créer une règle — brouillon</strong><span>Version attribuée par le serveur</span></div>
        <div className="form-grid">
          <label>Code de règle *<input required minLength={2} maxLength={80} pattern="[A-Za-z0-9][A-Za-z0-9_.:-]+" value={form.ruleCode} onChange={(event) => setForm((current) => ({ ...current, ruleCode: event.target.value }))} placeholder="BJ_VAT_STANDARD"/></label>
          <label>Libellé *<input required maxLength={160} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="TVA — régime normal"/></label>
          <label>Type de taxe<select value={form.taxType} onChange={(event) => setForm((current) => ({ ...current, taxType: event.target.value, treatment: event.target.value === "WITHHOLDING" ? "WITHHOLDING" : current.treatment === "WITHHOLDING" ? "STANDARD" : current.treatment }))}><option value="VAT">TVA</option><option value="GST">GST</option><option value="SALES_TAX">Taxe sur les ventes</option><option value="EXCISE">Accise</option><option value="WITHHOLDING">Retenue à la source</option><option value="CUSTOMS_DUTY">Droit de douane</option><option value="IMPORT_TAX">Taxe à l'importation</option><option value="ENVIRONMENTAL">Taxe environnementale</option><option value="STAMP_DUTY">Droit de timbre</option><option value="OTHER">Autre</option></select></label>
          <label>Traitement<select value={form.treatment} onChange={(event) => setForm((current) => ({ ...current, treatment: event.target.value }))}><option value="STANDARD">Normal</option><option value="REDUCED">Réduit</option><option value="ZERO_RATED">Taux zéro</option><option value="EXEMPT">Exonéré</option><option value="REVERSE_CHARGE">Autoliquidation</option><option value="WITHHOLDING">Retenue</option></select></label>
          <label>Taux (%) *<input required inputMode="decimal" value={form.ratePercent} onChange={(event) => setForm((current) => ({ ...current, ratePercent: event.target.value }))} placeholder="18.000000"/></label>
          <label>Mode de prix<select value={form.priceMode} onChange={(event) => setForm((current) => ({ ...current, priceMode: event.target.value }))}><option value="EXCLUSIVE">HT — taxe ajoutée</option><option value="INCLUSIVE">TTC — taxe incluse</option></select></label>
          <label>Applicable à<select value={form.appliesTo} onChange={(event) => setForm((current) => ({ ...current, appliesTo: event.target.value }))}><option value="ALL">Toutes catégories</option><option value="GOODS">Biens</option><option value="SERVICES">Services</option><option value="DIGITAL_SERVICES">Services numériques</option><option value="FREIGHT">Transport / fret</option><option value="INSURANCE">Assurance</option></select></label>
          <label>Priorité<input type="number" min="0" max="10000" value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))}/></label>
          <label>Date de début *<input type="date" required value={form.validFrom} onChange={(event) => setForm((current) => ({ ...current, validFrom: event.target.value }))}/></label>
          <label>Date de fin<input type="date" value={form.validTo} min={form.validFrom} onChange={(event) => setForm((current) => ({ ...current, validTo: event.target.value }))}/></label>
          <label>Référence officielle<input maxLength={500} value={form.sourceReference} onChange={(event) => setForm((current) => ({ ...current, sourceReference: event.target.value }))} placeholder="Loi, article, publication…"/></label>
          <label>URL de la source<input type="url" maxLength={2000} value={form.sourceUrl} onChange={(event) => setForm((current) => ({ ...current, sourceUrl: event.target.value }))} placeholder="https://…"/></label>
        </div>
        <label className="tax-admin-checkbox"><input type="checkbox" checked={form.isCompound} onChange={(event) => setForm((current) => ({ ...current, isCompound: event.target.checked }))}/> Taxe composée (assiette incluant les taxes précédentes)</label>
        <div className="tax-admin-form-footer"><span><ShieldCheck size={15}/> Le taux sera créé en DRAFT et ne sera pas appliqué aux factures.</span><button type="button" className="outline-button" onClick={() => setShowForm(false)} disabled={saving}>Annuler</button><button type="submit" className="primary-button" disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer le brouillon"}</button></div>
      </form>}
      {loading ? <div className="tax-admin-empty">Chargement des règles…</div> : filteredRules.length === 0 ? <div className="tax-admin-empty">Aucune règle fiscale enregistrée pour cette juridiction.</div> : <div className="tax-admin-table-wrap"><table className="data-table"><thead><tr><th>Règle</th><th>Type</th><th>Taux</th><th>Application</th><th>Validité</th><th>Version</th><th>Portée</th><th>Statut</th></tr></thead><tbody>{filteredRules.map((rule) => <tr key={rule.id}><td><strong>{rule.ruleCode}</strong><small>{rule.name}</small></td><td>{rule.taxType}</td><td>{rule.ratePercent}%</td><td>{rule.appliesTo}</td><td>{rule.validFrom}{rule.validTo ? ` → ${rule.validTo}` : " → sans fin"}</td><td>v{rule.version}</td><td>{rule.scope === "GLOBAL" ? "Référence globale" : "Organisation"}</td><td><span className={`status-chip ${rule.status === "ACTIVE" ? "status-success" : ""}`}>{rule.status === "DRAFT" ? "Brouillon" : rule.status === "ACTIVE" ? "Active" : "Retirée"}</span></td></tr>)}</tbody></table></div>}
    </section>
  </div>;
}
