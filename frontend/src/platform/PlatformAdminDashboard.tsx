import { useEffect, useMemo, useState } from "react";
import {
  Activity, Bell, Building2, ChevronDown, ChevronLeft, ChevronRight,
  CircleHelp, ClipboardList, CreditCard, FileText, Globe2, LayoutDashboard, LogOut,
  Menu, Moon, RefreshCw, Search, ShieldCheck, Sun, Users, X, type LucideIcon,
} from "lucide-react";
import { PlatformReviewWorkspace } from "./PlatformReviewWorkspace.js";
import "./PlatformAdminDashboard.css";
import { BrandLogo } from "../shared/components/BrandLogo.js";

type Section = "dashboard" | "requests" | "orgs" | "users" | "audit" | "finance" | "tax";
type RequestItem = { id: string; legalName: string; countryCode: string; status?: string; submittedAt: string };
type Payload<T> = { data?: T; error?: { message?: string } };
type PlatformOverview = {
  generatedAt: string;
  organizations: { total: number; active: number; pending: number; suspended: number; disabled: number };
  registrations: { total: number; pending: number; approved: number; rejected: number };
  users: { totalMemberships: number; activeMemberships: number; distinctIdentities: number };
  invoices: { total: number; draft: number; issued: number; cancelled: number };
  registrationTrend: { date: string; count: number }[];
  organizationsByCountry: { countryCode: string; count: number }[];
};

const groups: { label: string; items: { id: Section; label: string; icon: LucideIcon }[] }[] = [
  { label: "PLATEFORME", items: [
    { id: "requests", label: "Demandes d’inscription", icon: ClipboardList },
    { id: "orgs", label: "Organisations", icon: Building2 },
    { id: "users", label: "Utilisateurs & permissions", icon: Users },
    { id: "audit", label: "Journal d’audit", icon: Activity },
  ] },
  { label: "FINANCE", items: [
    { id: "finance", label: "Facturation & paiements", icon: CreditCard },
    { id: "tax", label: "Fiscalité & juridictions", icon: Globe2 },
  ] },
];

async function loadRequests(): Promise<RequestItem[]> {
  const response = await fetch("/api/v1/user/platform/registration-requests", {
    credentials: "same-origin", cache: "no-store",
  });
  const payload = await response.json().catch(() => ({})) as Payload<{ requests: RequestItem[] }>;
  if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? "Impossible de charger les demandes.");
  return payload.data.requests ?? [];
}

async function loadPlatformOverview(): Promise<PlatformOverview> {
  const response = await fetch("/api/v1/user/platform/dashboard-overview", {
    credentials: "same-origin", cache: "no-store",
  });
  const payload = await response.json().catch(() => ({})) as Payload<{ overview: PlatformOverview }>;
  if (!response.ok || !payload.data?.overview) {
    throw new Error(payload.error?.message ?? "Impossible de charger les indicateurs de la plateforme.");
  }
  return payload.data.overview;
}

export function PlatformAdminDashboard({ email, onSignOut }: { email: string; onSignOut: () => Promise<void> }) {
  const [section, setSection] = useState<Section>("dashboard");
  const [collapsed, setCollapsed] = useState(() => {
    try { return window.localStorage.getItem("zenox-platform-sidebar") === "collapsed"; } catch { return false; }
  });
  const [dark, setDark] = useState(() => {
    try { return window.localStorage.getItem("zenox-platform-theme") === "dark"; } catch { return false; }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [overview, setOverview] = useState<PlatformOverview | null>(null);
  const [overviewError, setOverviewError] = useState("");
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [requestsError, setRequestsError] = useState("");
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    try { window.localStorage.setItem("zenox-platform-sidebar", collapsed ? "collapsed" : "expanded"); } catch { /* storage optional */ }
  }, [collapsed]);
  useEffect(() => {
    try { window.localStorage.setItem("zenox-platform-theme", dark ? "dark" : "light"); } catch { /* storage optional */ }
    document.documentElement.dataset.platformTheme = dark ? "dark" : "light";
    return () => { delete document.documentElement.dataset.platformTheme; };
  }, [dark]);
  useEffect(() => {
    let cancelled = false;
    setRequestsLoading(true);
    setRequestsError("");
    void loadRequests().then((items) => { if (!cancelled) setRequests(items); })
      .catch((error: unknown) => { if (!cancelled) setRequestsError(error instanceof Error ? error.message : "Erreur de chargement."); })
      .finally(() => { if (!cancelled) setRequestsLoading(false); });
    return () => { cancelled = true; };
  }, [refreshKey]);

  useEffect(() => {
    let cancelled = false;
    setOverviewLoading(true);
    setOverviewError("");
    void loadPlatformOverview().then((data) => { if (!cancelled) setOverview(data); })
      .catch((error: unknown) => { if (!cancelled) setOverviewError(error instanceof Error ? error.message : "Erreur de chargement."); })
      .finally(() => { if (!cancelled) setOverviewLoading(false); });
    return () => { cancelled = true; };
  }, [refreshKey]);

  useEffect(() => {
    function handleSearchShortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        document.querySelector<HTMLInputElement>(".pad-search input")?.focus();
      }
      if (event.key === "Escape") {
        setQuery("");
        (document.activeElement as HTMLElement | null)?.blur?.();
      }
    }
    window.addEventListener("keydown", handleSearchShortcut);
    return () => window.removeEventListener("keydown", handleSearchShortcut);
  }, []);

  const title = useMemo(() => ({
    dashboard: "Tableau de bord de la plateforme", requests: "Demandes d’inscription",
    orgs: "Organisations", users: "Utilisateurs & permissions", audit: "Journal d’audit",
    finance: "Facturation & paiements", tax: "Fiscalité & juridictions",
  } satisfies Record<Section, string>)[section], [section]);
  const normalizedQuery = query.trim().toLocaleLowerCase("fr");
  const filteredRequests = requests.filter((request) => {
    if (!normalizedQuery) return true;
    return [request.legalName, request.countryCode, request.status ?? "PENDING", request.id]
      .some((value) => value.toLocaleLowerCase("fr").includes(normalizedQuery));
  });
  const pendingCount = requests.filter((request) => !request.status || request.status === "PENDING").length;
  const selectSection = (next: Section) => { setSection(next); setMobileOpen(false); setNotice(""); };

  return <div className={`pad-shell ${dark ? "pad-dark" : "pad-light"} ${collapsed ? "pad-collapsed" : ""}`}>
    {mobileOpen && <button className="pad-scrim" aria-label="Fermer la navigation" onClick={() => setMobileOpen(false)} />}
    <aside className={`pad-sidebar ${mobileOpen ? "pad-sidebar-open" : ""}`}>
      <div className="pad-brand"><BrandLogo variant={collapsed ? "compact" : "light"} />{!collapsed && <small className="pad-brand-caption">PLATFORM</small>}<button className="pad-collapse" onClick={() => setCollapsed(!collapsed)} title={collapsed ? "Développer la barre latérale" : "Rétracter la barre latérale"} aria-label="Rétracter ou développer la navigation"><ChevronLeft size={17}/></button><button className="pad-mobile-close" onClick={() => setMobileOpen(false)} aria-label="Fermer"><X size={18}/></button></div>
      <button className={`pad-nav-item ${section === "dashboard" ? "active" : ""}`} title="Tableau de bord" onClick={() => selectSection("dashboard")}><LayoutDashboard size={18}/>{!collapsed && <span>Tableau de bord</span>}</button>
      {groups.map((group) => <div className="pad-nav-group" key={group.label}>{!collapsed && <div className="pad-nav-label">{group.label}</div>}{group.items.map(({ id, label, icon: Icon }) => <button key={id} title={label} className={`pad-nav-item ${section === id ? "active" : ""}`} onClick={() => selectSection(id)}><Icon size={18}/>{!collapsed && <span>{label}</span>}{id === "requests" && pendingCount > 0 && !collapsed && <b className="pad-count">{pendingCount}</b>}</button>)}</div>)}
      <div className="pad-sidebar-bottom"><div className="pad-secure"><ShieldCheck size={18}/>{!collapsed && <div><strong>Accès sécurisé</strong><small>Opérateur plateforme vérifié</small></div>}</div><button className="pad-nav-item" title="Centre d’aide" onClick={() => setNotice("Le centre d’aide sera connecté dans une prochaine étape.")}><CircleHelp size={18}/>{!collapsed && <span>Centre d’aide</span>}</button><div className="pad-user" title={email}><span className="pad-avatar">{email.slice(0,2).toUpperCase()}</span>{!collapsed && <span className="pad-user-copy"><strong>Super Admin</strong><small>{email}</small></span>}<button className="pad-signout" aria-label="Se déconnecter" onClick={(event) => { event.stopPropagation(); void onSignOut(); }}><LogOut size={15}/></button></div></div>
    </aside>
    <main className="pad-main">
      <header className="pad-topbar"><button className="pad-mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Ouvrir la navigation"><Menu size={20}/></button><div className="pad-search"><Search size={17}/><input aria-label="Rechercher une demande d’inscription" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher une demande (nom, pays, statut)…"/>{query && <button type="button" className="pad-search-clear" onClick={() => setQuery("")} aria-label="Effacer la recherche"><X size={13}/></button>}<kbd>Ctrl K</kbd></div><div className="pad-top-actions"><span className="pad-operator"><span className="pad-avatar">{email.slice(0,2).toUpperCase()}</span><span><strong>Super Admin</strong><small>ZENOX Finance</small></span><ChevronDown size={14}/></span><button className="pad-theme-toggle" onClick={() => setDark(!dark)} aria-label={dark ? "Activer le thème clair" : "Activer le thème sombre"}>{dark ? <Moon size={16}/> : <Sun size={16}/>}<span>{dark ? "Sombre" : "Clair"}</span></button><button className="pad-bell" onClick={() => setNotice("Les notifications seront reliées au service de notifications.")} aria-label="Notifications"><Bell size={18}/><i/></button></div></header>
      <div className="pad-content">
        <div className="pad-page-heading"><div><div className="pad-eyebrow"><ShieldCheck size={14}/> ADMINISTRATION DE LA PLATEFORME</div><h1>{title}</h1><p>Supervisez ZENOX Finance, ses organisations et ses opérations.</p></div><span className="pad-live"><i/> Session sécurisée</span></div>
        {notice && <div className="pad-notice" role="status">{notice}<button onClick={() => setNotice("")} aria-label="Fermer"><X size={15}/></button></div>}
        {section === "dashboard" && <DashboardOverview overview={overview} overviewLoading={overviewLoading} overviewError={overviewError} pendingCount={pendingCount} requests={filteredRequests} loading={requestsLoading} error={requestsError} query={query} onRefresh={() => setRefreshKey((value) => value + 1)} onNavigate={selectSection}/>} 
        {section === "requests" && <div className="pad-module"><div className="pad-module-tools"><div><h2>Revue des inscriptions</h2><p>Examinez les demandes et prenez une décision motivée.</p></div><div className="pad-module-actions"><span className="pad-source-label">API sécurisée</span><button type="button" className="pad-refresh-button" onClick={() => setRefreshKey((value) => value + 1)}><RefreshCw size={14}/> Actualiser les indicateurs</button></div></div><PlatformReviewWorkspace key={refreshKey} searchQuery={query}/></div>}
        {section === "orgs" && <ModulePlaceholder icon={Building2} title="Organisations" description="La gestion globale des organisations nécessite une API plateforme dédiée. Aucune donnée de démonstration n’est affichée."/>}
        {section === "users" && <ModulePlaceholder icon={Users} title="Utilisateurs & permissions" description="Les comptes, rôles et rattachements seront affichés après connexion aux endpoints plateforme autorisés."/>}
        {section === "audit" && <ModulePlaceholder icon={Activity} title="Journal d’audit" description="Les événements d’audit seront consultables ici dès que l’API plateforme de lecture sera disponible."/>}
        {section === "finance" && <ModulePlaceholder icon={CreditCard} title="Facturation & paiements" description="Les indicateurs globaux ne seront affichés qu’à partir d’agrégats fournis par le backend, sans mélanger les tenants."/>}
        {section === "tax" && <ModulePlaceholder icon={Globe2} title="Fiscalité & juridictions" description="Les règles et juridictions seront intégrées depuis les services Finance autorisés, avec leur version et leur statut."/>}
        <footer className="pad-footer"><span>© 2026 ZENOX Finance</span><span><ShieldCheck size={13}/> Accès contrôlé côté serveur</span><span>Console plateforme V3</span></footer>
      </div>
    </main>
  </div>;
}

function DashboardOverview({ overview, overviewLoading, overviewError, pendingCount, requests, loading, error, query, onRefresh, onNavigate }: {
  overview: PlatformOverview | null; overviewLoading: boolean; overviewError: string;
  pendingCount: number; requests: RequestItem[]; loading: boolean; error: string; query: string;
  onRefresh: () => void; onNavigate: (section: Section) => void
}) {
  const metrics = [
    { label: "Organisations actives", value: overviewLoading ? "…" : overview ? String(overview.organizations.active) : "—", hint: overview ? `${overview.organizations.total} au total · ${overview.organizations.pending} en attente` : "Indicateur indisponible", icon: Building2, tone: "blue" },
    { label: "Demandes en attente", value: overviewLoading ? "…" : overview ? String(overview.registrations.pending) : "—", hint: overview ? `${overview.registrations.approved} approuvées · ${overview.registrations.rejected} rejetées` : "Indicateur indisponible", icon: ClipboardList, tone: "violet" },
    { label: "Utilisateurs distincts", value: overviewLoading ? "…" : overview ? String(overview.users.distinctIdentities) : "—", hint: overview ? `${overview.users.activeMemberships} rattachements actifs` : "Indicateur indisponible", icon: Users, tone: "green" },
    { label: "Factures émises", value: overviewLoading ? "…" : overview ? String(overview.invoices.issued) : "—", hint: overview ? `${overview.invoices.draft} brouillons · ${overview.invoices.cancelled} annulées` : "Indicateur indisponible", icon: FileText, tone: "orange" },
  ];
  const maxTrend = Math.max(1, ...(overview?.registrationTrend ?? []).map((item) => item.count));
  return <>
    <section className="pad-metrics">{metrics.map(({label,value,hint,icon:Icon,tone}) => <article className="pad-metric" key={label}><div className={`pad-metric-icon ${tone}`}><Icon size={19}/></div><div className="pad-metric-copy"><span>{label}</span><strong>{value}</strong><small>{hint}</small></div></article>)}</section>
    {overviewError && <div className="pad-inline-error" role="alert">{overviewError}<button type="button" className="pad-refresh-button" onClick={onRefresh}><RefreshCw size={14}/> Réessayer</button></div>}
    <div className="pad-overview-grid">
      <section className="pad-panel pad-chart-panel">
        <div className="pad-panel-heading"><div><h2>Évolution des inscriptions</h2><p>Demandes reçues sur les 14 derniers jours · source Finance</p></div><span className="pad-source-label">Agrégats serveur</span></div>
        {overviewLoading ? <div className="pad-chart-empty"><Activity size={25}/><strong>Chargement des indicateurs…</strong></div> : overview ? <div className="pad-trend-chart" role="img" aria-label="Nombre de demandes d’inscription par jour">{overview.registrationTrend.map((item) => <div className="pad-trend-column" key={item.date}><strong>{item.count}</strong><div className="pad-trend-track"><i style={{height: `${Math.max(4, item.count / maxTrend * 100)}%`}}/></div><small>{new Date(`${item.date}T12:00:00`).toLocaleDateString("fr-FR", {day:"2-digit",month:"2-digit"})}</small></div>)}</div> : <div className="pad-chart-empty"><Activity size={25}/><strong>Graphique indisponible</strong><span>Les données n’ont pas pu être chargées.</span></div>}
      </section>
      <section className="pad-panel">
        <div className="pad-panel-heading"><div><h2>Répartition géographique</h2><p>Organisations par pays</p></div><Globe2 size={18}/></div>
        {!overview ? <div className="pad-chart-empty compact"><Globe2 size={25}/><strong>Répartition indisponible</strong><span>Les données seront affichées après chargement.</span></div> : <div className="pad-country-list">{overview.organizationsByCountry.length === 0 ? <div className="pad-empty-row">Aucune organisation enregistrée.</div> : overview.organizationsByCountry.map((item) => <div className="pad-country-row" key={item.countryCode}><strong>{item.countryCode}</strong><span><i style={{width: `${Math.max(4, item.count / Math.max(1, overview.organizations.total) * 100)}%`}}/></span><b>{item.count}</b></div>)}</div>}
      </section>
    </div>
    <section className="pad-panel pad-recent"><div className="pad-panel-heading"><div><h2>{query.trim() ? "Résultats des demandes" : "Demandes récentes"}</h2><p>Source : endpoint sécurisé des demandes d’inscription{query.trim() ? ` · ${requests.length} résultat(s) correspondant(s)` : ""}</p></div><div className="pad-module-actions"><button type="button" className="pad-refresh-button" onClick={onRefresh} disabled={loading || overviewLoading}><RefreshCw size={14}/> Actualiser</button><button className="pad-text-button" onClick={() => onNavigate("requests")}>Voir les demandes <ChevronRight size={15}/></button></div></div>
      {error ? <div className="pad-inline-error" role="alert"><span>{error}</span><button type="button" className="pad-refresh-button" onClick={onRefresh}><RefreshCw size={14}/> Réessayer</button></div> : loading ? <div className="pad-empty-row">Chargement des demandes…</div> : requests.length === 0 ? <div className="pad-empty-row">{query.trim() ? "Aucune demande ne correspond à cette recherche." : "Aucune demande disponible pour le moment."}</div> : <div className="pad-table-scroll"><table className="pad-table"><thead><tr><th>Organisation</th><th>Pays</th><th>Statut</th><th>Reçue le</th><th/></tr></thead><tbody>{requests.slice(0,6).map((item) => <tr key={item.id}><td><strong>{item.legalName}</strong><small>{item.id}</small></td><td>{item.countryCode}</td><td><span className="pad-status">{item.status ?? "PENDING"}</span></td><td>{new Date(item.submittedAt).toLocaleDateString("fr-FR")}</td><td><button className="pad-row-action" onClick={() => onNavigate("requests")} aria-label={`Ouvrir la demande de ${item.legalName}`}><ChevronRight size={16}/></button></td></tr>)}</tbody></table></div>}
    </section>
    <div className="pad-overview-footnote"><ShieldCheck size={14}/> Mis à jour : {overview?.generatedAt ? new Date(overview.generatedAt).toLocaleString("fr-FR") : "—"} · Les paiements ne sont pas comptabilisés tant que leur module n’est pas disponible.</div>
  </>;
}

function ModulePlaceholder({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return <section className="pad-module-placeholder"><div className="pad-placeholder-icon"><Icon size={25}/></div><span className="pad-source-label">Écran préparé · API à connecter</span><h2>{title}</h2><p>{description}</p><div className="pad-placeholder-foot"><ShieldCheck size={16}/> Aucun chiffre ni enregistrement fictif affiché.</div></section>;
}
