import { useEffect, useState } from "react";
import {
  Activity, ArrowUpRight, BookOpen, CreditCard, FileCheck2, FileText, Globe2,
  Plus, ShieldCheck, SlidersHorizontal, Sparkles, WalletCards
} from "lucide-react";
import type { Page } from "../../app/navigation.js";

type DashboardSummary = {
  issuedInvoiceCount: number;
  draftInvoiceCount: number;
  issuedTotal: string;
  currencyCode: string | null;
  minorUnit: number;
};

function formatMoneyString(value: string, currency: string, minorUnit: number): string {
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [whole = "0", fraction = ""] = unsigned.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const decimals = minorUnit > 0 ? "." + fraction.padEnd(minorUnit, "0").slice(0, minorUnit) : "";
  return `${currency} ${negative ? "-" : ""}${grouped}${decimals}`;
}

export function Dashboard({ onNavigate, tenantId }: { onNavigate: (page: Page) => void; tenantId: string }) {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setSummaryLoading(true);
    setSummaryError("");
    void fetch(`/api/v1/user/tenants/${tenantId}/dashboard-summary`, { credentials: "same-origin", cache: "no-store" })
      .then((response) => readEntryData<DashboardSummary>(response))
      .then((data) => { if (!cancelled) setSummary(data); })
      .catch((error: unknown) => { if (!cancelled) setSummaryError(error instanceof Error ? error.message : "Impossible de charger les indicateurs."); })
      .finally(() => { if (!cancelled) setSummaryLoading(false); });
    return () => { cancelled = true; };
  }, [tenantId]);

  return <>
    <div className="welcome-row"><div><div className="eyebrow"><Sparkles size={14}/> VOTRE ESPACE FINANCIER</div><h1>Bonjour, bienvenue 👋</h1><p className="subtitle">Une vue claire sur les opérations financières de votre organisation.</p></div><button className="primary-button" onClick={() => onNavigate("invoices")}><Plus size={17}/> Nouvelle facture</button></div>
    <div className="demo-banner"><div className="demo-icon"><Activity size={19}/></div><div><strong>Données de votre organisation</strong><p>Les indicateurs de facturation sont chargés depuis l’API Finance authentifiée, dans le périmètre de votre organisation.</p>{summaryError && <p role="alert">{summaryError}</p>}</div><span className="demo-pill">CONNECTÉ</span></div>
    <section className="metrics-grid">
      <Metric title="Factures émises" value={summaryLoading ? "…" : String(summary?.issuedInvoiceCount ?? "—")} hint="Factures au statut Émise" icon={FileText} tone="blue" trend="Source : API Finance"/>
      <Metric title="Total facturé" value={summaryLoading ? "…" : summary?.currencyCode ? formatMoneyString(summary.issuedTotal, summary.currencyCode, summary.minorUnit) : "—"} hint="Montant brut des factures émises" icon={ArrowUpRight} tone="green" trend="Calcul agrégé côté serveur"/>
      <Metric title="Brouillons" value={summaryLoading ? "…" : String(summary?.draftInvoiceCount ?? "—")} hint="Factures non encore émises" icon={FileCheck2} tone="amber" trend="Source : API Finance"/>
      <Metric title="Encaissements" value="—" hint="Indicateur indisponible à ce stade" icon={WalletCards} tone="violet" trend="À connecter au module Paiements"/>
    </section>
    <div className="content-grid">
      <section className="panel activity-panel"><div className="panel-heading"><div><h2>Activité financière</h2><p>Suivi des opérations récentes</p></div><button className="text-button" onClick={() => onNavigate("invoices")}>Voir les factures <ArrowUpRight size={15}/></button></div><div className="empty-state"><div className="empty-illustration"><FileCheck2 size={27}/></div><strong>Suivi des opérations</strong><p>Les indicateurs ci-dessus sont réels. La liste détaillée des dernières opérations sera ajoutée à cette vue dans la prochaine étape.</p><button className="outline-button" onClick={() => onNavigate("invoices")}>Explorer les factures</button></div></section>
      <section className="panel quick-panel"><div className="panel-heading"><div><h2>Accès rapides</h2><p>Les outils essentiels</p></div><SlidersHorizontal size={17} className="muted-icon"/></div><button className="quick-link" onClick={() => onNavigate("tax")}><div className="quick-icon purple"><Globe2 size={18}/></div><span><strong>Calcul fiscal</strong><small>Règles versionnées et snapshots</small></span><ArrowUpRight size={16}/></button><button className="quick-link" onClick={() => onNavigate("invoices")}><div className="quick-icon blue"><FileText size={18}/></div><span><strong>Gestion des factures</strong><small>Cycle de vie et documents</small></span><ArrowUpRight size={16}/></button><button className="quick-link" onClick={() => onNavigate("payments")}><div className="quick-icon green"><CreditCard size={18}/></div><span><strong>Paiements</strong><small>Encaissements et allocations</small></span><ArrowUpRight size={16}/></button><div className="integration-note"><BookOpen size={17}/><p><strong>Prêt pour l’intégration</strong><br/>ZENOX FRET V2 sera le premier consommateur autorisé de la plateforme.</p></div></section>
    </div>
    <section className="bottom-note"><ShieldCheck size={17}/><span><strong>La source de vérité reste le backend.</strong> Les calculs monétaires, règles fiscales et écritures seront exécutés et contrôlés côté serveur.</span></section>
  </>;
}

function Metric({ title, value, hint, icon: Icon, tone, trend }: { title: string; value: string; hint: string; icon: typeof FileText; tone: string; trend: string }) {
  return <article className="metric-card"><div className="metric-top"><span>{title}</span><div className={`metric-icon ${tone}`}><Icon size={18}/></div></div><div className="metric-value">{value}</div><div className="metric-hint">{hint}</div><div className="metric-trend"><span className="trend-dot"/> {trend}</div></article>;
}

