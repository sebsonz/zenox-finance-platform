import { useEffect, useState } from "react";
import {
  Activity, ArrowUpRight, BookOpen, CreditCard, FileCheck2, FileText,
  Globe2, Plus, RefreshCw, ShieldCheck, SlidersHorizontal, Sparkles,
  Users,
} from "lucide-react";
import type { Page } from "../../app/navigation.js";
import "./dashboard.css";

async function readEntryData<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({})) as { data?: T; error?: { message?: string } };
  if (!response.ok || payload.data === undefined) {
    throw new Error(payload.error?.message ?? "Impossible de charger les données du tableau de bord.");
  }
  return payload.data;
}

type DashboardSummary = {
  issuedInvoiceCount: number;
  draftInvoiceCount: number;
  issuedTotal: string;
  currencyCode: string | null;
  minorUnit: number;
};
type CustomerPreview = {
  id: string;
  customerCode: string;
  customerType: "BUSINESS" | "INDIVIDUAL";
  legalName: string;
  displayName: string | null;
  countryCode: string;
};
type CustomerPage = { customers: CustomerPreview[]; page?: { hasMore?: boolean; count?: number } };

function formatMoneyString(value: string, currency: string, minorUnit: number): string {
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [whole = "0", fraction = ""] = unsigned.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const decimals = minorUnit > 0 ? "." + fraction.padEnd(minorUnit, "0").slice(0, minorUnit) : "";
  return currency + " " + (negative ? "-" : "") + grouped + decimals;
}

export function Dashboard({ onNavigate, tenantId }: { onNavigate: (page: Page) => void; tenantId: string }) {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState("");
  const [customers, setCustomers] = useState<CustomerPreview[]>([]);
  const [customersHasMore, setCustomersHasMore] = useState(false);
  const [customersLoading, setCustomersLoading] = useState(true);
  const [customersError, setCustomersError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setSummaryLoading(true);
    setSummaryError("");
    void fetch("/api/v1/user/tenants/" + encodeURIComponent(tenantId) + "/dashboard-summary", {
      credentials: "same-origin", cache: "no-store",
    })
      .then((response) => readEntryData<DashboardSummary>(response))
      .then((data) => { if (!cancelled) setSummary(data); })
      .catch((error: unknown) => {
        if (!cancelled) setSummaryError(error instanceof Error ? error.message : "Impossible de charger les indicateurs de facturation.");
      })
      .finally(() => { if (!cancelled) setSummaryLoading(false); });

    setCustomersLoading(true);
    setCustomersError("");
    const params = new URLSearchParams({ status: "ACTIVE", limit: "5" });
    void fetch("/api/v1/user/tenants/" + encodeURIComponent(tenantId) + "/customers?" + params, {
      credentials: "same-origin", cache: "no-store",
    })
      .then((response) => readEntryData<CustomerPage>(response))
      .then((data) => {
        if (!cancelled) {
          setCustomers(data.customers ?? []);
          setCustomersHasMore(Boolean(data.page?.hasMore));
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setCustomers([]);
          setCustomersError(error instanceof Error ? error.message : "Impossible de charger le répertoire clients.");
        }
      })
      .finally(() => { if (!cancelled) setCustomersLoading(false); });

    return () => { cancelled = true; };
  }, [tenantId, refreshKey]);

  return <>
    <div className="welcome-row">
      <div>
        <div className="eyebrow"><Sparkles size={14}/> VOTRE ESPACE FINANCIER</div>
        <h1>Vue d’ensemble</h1>
        <p className="subtitle">Suivez les données réelles de votre organisation depuis un espace de travail unique.</p>
      </div>
      <div className="dashboard-heading-actions">
        <button className="outline-button dashboard-refresh" type="button" onClick={() => setRefreshKey((value) => value + 1)} disabled={summaryLoading || customersLoading}><RefreshCw size={15}/> Actualiser</button>
        <button className="primary-button" type="button" onClick={() => onNavigate("invoices")}><Plus size={17}/> Nouvelle facture</button>
      </div>
    </div>

    <div className="demo-banner">
      <div className="demo-icon"><Activity size={19}/></div>
      <div><strong>Données de votre organisation</strong><p>Les indicateurs sont demandés aux API authentifiées et limités au tenant actif. Aucun chiffre de démonstration n'est affiché.</p></div>
      <span className="demo-pill">API FINANCE</span>
    </div>

    {(summaryError || customersError) && <div className="notice dashboard-error" role="alert">
      <span>{[summaryError && ("Facturation : " + summaryError), customersError && ("Clients : " + customersError)].filter(Boolean).join(" · ")}</span>
      <button type="button" onClick={() => setRefreshKey((value) => value + 1)}>Réessayer</button>
    </div>}

    <section className="metrics-grid" aria-label="Indicateurs de l'organisation">
      <Metric title="Factures émises" value={summaryLoading ? "…" : summaryError ? "—" : String(summary?.issuedInvoiceCount ?? 0)} hint="Factures au statut Émise" icon={FileText} tone="blue" trend="API Facturation"/>
      <Metric title="Total facturé" value={summaryLoading ? "…" : summaryError ? "—" : summary?.currencyCode ? formatMoneyString(summary.issuedTotal, summary.currencyCode, summary.minorUnit) : "—"} hint="Montant brut des factures émises" icon={ArrowUpRight} tone="green" trend="Agrégat serveur"/>
      <Metric title="Brouillons" value={summaryLoading ? "…" : summaryError ? "—" : String(summary?.draftInvoiceCount ?? 0)} hint="Factures non encore émises" icon={FileCheck2} tone="amber" trend="API Facturation"/>
      <Metric title="Clients chargés" value={customersLoading ? "…" : customersError ? "—" : String(customers.length)} hint="Première page du répertoire actif" icon={Users} tone="violet" trend="API Clients · M04"/>
    </section>

    <div className="content-grid">
      <section className="panel activity-panel">
        <div className="panel-heading"><div><h2>Activité financière</h2><p>État des opérations de facturation</p></div><button className="text-button" onClick={() => onNavigate("invoices")}>Ouvrir les factures <ArrowUpRight size={15}/></button></div>
        <div className="empty-state">
          <div className="empty-illustration"><FileCheck2 size={27}/></div>
          <strong>Consulter le cycle de facturation</strong>
          <p>Accédez aux brouillons, aux factures émises et aux documents disponibles pour votre organisation.</p>
          <button className="outline-button" onClick={() => onNavigate("invoices")}>Explorer les factures</button>
        </div>
      </section>
      <section className="panel quick-panel">
        <div className="panel-heading"><div><h2>Accès rapides</h2><p>Les espaces disponibles</p></div><SlidersHorizontal size={17} className="muted-icon"/></div>
        <button className="quick-link" onClick={() => onNavigate("customers")}><div className="quick-icon blue"><Users size={18}/></div><span><strong>Clients & contacts</strong><small>Répertoire de votre organisation · M04</small></span><ArrowUpRight size={16}/></button>
        <button className="quick-link" onClick={() => onNavigate("invoices")}><div className="quick-icon blue"><FileText size={18}/></div><span><strong>Gestion des factures</strong><small>Brouillons, émission et documents</small></span><ArrowUpRight size={16}/></button>
        <button className="quick-link" onClick={() => onNavigate("tax")}><div className="quick-icon purple"><Globe2 size={18}/></div><span><strong>Moteur fiscal</strong><small>Règles et snapshots versionnés</small></span><ArrowUpRight size={16}/></button>
        <button className="quick-link" onClick={() => onNavigate("payments")}><div className="quick-icon green"><CreditCard size={18}/></div><span><strong>Paiements</strong><small>Module en cours d’intégration</small></span><ArrowUpRight size={16}/></button>
        <div className="integration-note"><BookOpen size={17}/><p><strong>Architecture API-first</strong><br/>ZENOX FRET V2 sera le premier consommateur externe autorisé de Finance.</p></div>
      </section>
    </div>

    <section className="panel dashboard-customer-panel">
      <div className="panel-heading">
        <div><h2>Aperçu du répertoire clients</h2><p>Premiers enregistrements accessibles dans le tenant actif · lecture seule M04</p></div>
        <button className="text-button" type="button" onClick={() => onNavigate("customers")}>Ouvrir le répertoire <ArrowUpRight size={15}/></button>
      </div>
      {customersLoading ? <div className="dashboard-customer-state">Chargement des clients autorisés…</div>
        : customersError ? <div className="dashboard-customer-state dashboard-customer-error" role="alert">Le répertoire clients n'est pas accessible avec les permissions de cette session.</div>
        : customers.length === 0 ? <div className="dashboard-customer-state">Aucun client actif n'est encore enregistré dans cette organisation. Vous pouvez ouvrir le répertoire pour vérifier son contenu.</div>
        : <div className="dashboard-customer-list">{customers.map((customer) => <div className="dashboard-customer-row" key={customer.id}>
          <span className="dashboard-customer-avatar">{customer.customerType === "BUSINESS" ? "E" : "P"}</span>
          <span className="dashboard-customer-name"><strong>{customer.displayName || customer.legalName}</strong><small>{customer.customerCode}</small></span>
          <span className="dashboard-customer-country">{customer.countryCode}</span>
          <span className="dashboard-customer-status">Actif</span>
        </div>)}</div>}
      {customersHasMore && !customersError && <p className="dashboard-customer-footnote">Aperçu limité à 5 clients. Ouvrez le répertoire pour consulter les autres enregistrements.</p>}
    </section>

    <section className="bottom-note"><ShieldCheck size={17}/><span><strong>La source de vérité reste le backend.</strong> Les calculs monétaires, les permissions, les règles fiscales et les écritures sont contrôlés côté serveur.</span></section>
  </>;
}

function Metric({ title, value, hint, icon: Icon, tone, trend }: { title: string; value: string; hint: string; icon: typeof FileText; tone: string; trend: string }) {
  return <article className="metric-card"><div className="metric-top"><span>{title}</span><div className={"metric-icon " + tone}><Icon size={18}/></div></div><div className="metric-value">{value}</div><div className="metric-hint">{hint}</div><div className="metric-trend"><span className="trend-dot"/> {trend}</div></article>;
}
