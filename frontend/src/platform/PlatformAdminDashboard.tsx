import { useEffect, useState } from "react";
import {
  Activity, Bell, Building2, CheckCircle2, ChevronDown, ChevronRight,
  CircleHelp, ClipboardList, CreditCard, FileCheck2,
  LayoutDashboard, LogOut, Moon, RefreshCw, Search,
  Server, Settings2, ShieldCheck, Sun, Users, X, ArrowLeftRight, BarChart3,
  LockKeyhole, type LucideIcon,
} from "lucide-react";
import { PlatformReviewWorkspace } from "./PlatformReviewWorkspace.js";
import "./PlatformAdminDashboard.css";
import { BrandLogo } from "../shared/components/BrandLogo.js";

type Section = "dashboard" | "analytics" | "orgs" | "users" | "requests" | "kyc" | "operations" | "revenue" | "audit" | "health" | "security" | "settings";
type RequestItem = { id: string; legalName: string; countryCode: string; status?: string; submittedAt: string };
type PlatformOrganization = { id: string; tenantCode: string; legalName: string; countryCode: string; defaultCurrency: string; status: "PENDING" | "ACTIVE" | "SUSPENDED" | "DISABLED"; createdAt: string };
type Payload<T> = { data?: T; error?: { message?: string } };
type NavItem = { id: Section; label: string; icon: LucideIcon };
const navGroups: { label: string; items: NavItem[] }[] = [
  { label: "PILOTAGE", items: [
    { id: "dashboard", label: "Tableau de bord", icon: LayoutDashboard },
    { id: "analytics", label: "Analytics & rapports", icon: BarChart3 },
  ]},
  { label: "GESTION", items: [
    { id: "orgs", label: "Organisations", icon: Building2 },
    { id: "users", label: "Utilisateurs & permissions", icon: Users },
    { id: "requests", label: "Inscriptions & approbations", icon: ClipboardList },
    { id: "kyc", label: "Conformité & KYC", icon: FileCheck2 },
  ]},
  { label: "SUPERVISION", items: [
    { id: "operations", label: "Opérations financières", icon: ArrowLeftRight },
    { id: "revenue", label: "Facturation & revenus", icon: CreditCard },
    { id: "audit", label: "Journal d'audit", icon: Activity },
    { id: "health", label: "Santé & surveillance", icon: Server },
  ]},
  { label: "ADMINISTRATION", items: [
    { id: "security", label: "Administrateurs & sécurité", icon: ShieldCheck },
    { id: "settings", label: "Paramètres plateforme", icon: Settings2 },
  ]},
];
const titles: Record<Section, string> = {
  dashboard: "Tableau de bord plateforme", analytics: "Analytics & rapports", orgs: "Organisations",
  users: "Utilisateurs & permissions", requests: "Inscriptions & approbations", kyc: "Conformité & KYC",
  operations: "Opérations financières", revenue: "Facturation & revenus", audit: "Journal d'audit",
  health: "Santé & surveillance", security: "Administrateurs & sécurité", settings: "Paramètres plateforme",
};
const descriptions: Record<Section, string> = {
  dashboard: "Supervisez ZENOX Finance, ses organisations, ses utilisateurs et ses opérations.",
  analytics: "Analysez la croissance et les indicateurs consolidés de la plateforme.",
  orgs: "Répertoire global des organisations inscrites sur ZENOX Finance.",
  users: "Consultez les comptes, les rôles et les rattachements aux organisations.",
  requests: "Examinez les demandes d'inscription et leurs pièces justificatives.",
  kyc: "Suivez les contrôles documentaires et la conformité des organisations.",
  operations: "Supervisez les opérations financières de toutes les organisations.",
  revenue: "Suivez la facturation et les revenus générés par la plateforme.",
  audit: "Consultez les événements sensibles et les actions des administrateurs.",
  health: "Surveillez les services, les dépendances et la disponibilité de la plateforme.",
  security: "Gérez les accès privilégiés et les paramètres de sécurité.",
  settings: "Configurez les référentiels et les préférences globales de ZENOX Finance.",
};

async function readPayload<T>(response: Response, fallback: string): Promise<T> {
  const payload = await response.json().catch(() => ({})) as Payload<T>;
  if (!response.ok || payload.data === undefined) throw new Error(payload.error?.message ?? fallback);
  return payload.data;
}
async function loadOrganizations(): Promise<PlatformOrganization[]> {
  const response = await fetch("/api/v1/user/platform/organizations", { credentials: "same-origin", cache: "no-store" });
  const data = await readPayload<{ organizations: PlatformOrganization[] }>(response, "Impossible de charger les organisations.");
  return data.organizations ?? [];
}
async function loadRequests(): Promise<RequestItem[]> {
  const response = await fetch("/api/v1/user/platform/registration-requests", { credentials: "same-origin", cache: "no-store" });
  const data = await readPayload<{ requests: RequestItem[] }>(response, "Impossible de charger les demandes.");
  return data.requests ?? [];
}
function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}
function statusLabel(status: string) {
  return ({ ACTIVE: "Active", PENDING: "En attente", SUSPENDED: "Suspendue", DISABLED: "Désactivée", APPROVED: "Approuvée", REJECTED: "Rejetée" } as Record<string,string>)[status] ?? status;
}

export function PlatformAdminDashboard({ email, onSignOut }: { email: string; onSignOut: () => Promise<void> }) {
  const [section, setSection] = useState<Section>("dashboard");
  const [collapsed, setCollapsed] = useState(false);
  const [dark, setDark] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [organizations, setOrganizations] = useState<PlatformOrganization[]>([]);
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [organizationsError, setOrganizationsError] = useState("");
  const [requestsError, setRequestsError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    document.documentElement.dataset.platformTheme = dark ? "dark" : "light";
    return () => { delete document.documentElement.dataset.platformTheme; };
  }, [dark]);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setOrganizationsError(""); setRequestsError("");
    Promise.allSettled([loadOrganizations(), loadRequests()]).then(([orgResult, reqResult]) => {
      if (cancelled) return;
      if (orgResult.status === "fulfilled") setOrganizations(orgResult.value);
      else setOrganizationsError(orgResult.reason instanceof Error ? orgResult.reason.message : "Erreur de chargement du répertoire.");
      if (reqResult.status === "fulfilled") setRequests(reqResult.value);
      else setRequestsError(reqResult.reason instanceof Error ? reqResult.reason.message : "Erreur de chargement des demandes.");
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [refreshKey]);
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault(); document.querySelector<HTMLInputElement>(".pad-search input")?.focus();
      }
      if (event.key === "Escape") { setQuery(""); (document.activeElement as HTMLElement | null)?.blur?.(); }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  const normalizedQuery = query.trim().toLocaleLowerCase("fr");
  const filteredOrganizations = organizations.filter((item) =>
    (statusFilter === "ALL" || item.status === statusFilter) &&
    [item.legalName, item.tenantCode, item.countryCode, item.defaultCurrency, item.status, item.id]
      .some((value) => value.toLocaleLowerCase("fr").includes(normalizedQuery)));
  const pendingCount = requests.length;
  const activeCount = organizations.filter((item) => item.status === "ACTIVE").length;
  const selectSection = (next: Section) => { setSection(next); setMobileOpen(false); setNotice(""); };
  const refresh = () => setRefreshKey((value) => value + 1);

  return <div className={`pad-shell ${dark ? "pad-dark" : "pad-light"} ${collapsed ? "pad-collapsed" : ""}`}>
    {mobileOpen && <button className="pad-scrim" aria-label="Fermer la navigation" onClick={() => setMobileOpen(false)} />}
    <aside className={`pad-sidebar ${mobileOpen ? "pad-sidebar-open" : ""}`}>
      <div className="pad-brand"><BrandLogo variant={collapsed ? "compact" : "light"} /><span className="pad-brand-context">PLATFORM</span><button className="pad-collapse" onClick={() => setCollapsed(!collapsed)} aria-label="Rétracter ou développer la navigation"><ChevronDown size={16}/></button><button className="pad-mobile-close" onClick={() => setMobileOpen(false)} aria-label="Fermer"><X size={18}/></button></div>
      {navGroups.map((group) => <div className="pad-nav-group" key={group.label}><div className="pad-nav-label">{group.label}</div>{group.items.map(({ id, label, icon: Icon }) => <button key={id} title={label} className={`pad-nav-item ${section === id ? "active" : ""}`} onClick={() => selectSection(id)}><Icon size={18}/><span>{label}</span>{id === "requests" && pendingCount > 0 && <b className="pad-count">{pendingCount}</b>}</button>)}</div>)}
      <div className="pad-sidebar-bottom"><div className="pad-secure"><ShieldCheck size={18}/><div><strong>API plateforme sécurisée</strong><small>Accès opérateur vérifié</small></div></div><button className="pad-nav-item" onClick={() => setNotice("Le centre d'aide sera connecté ultérieurement.")}><CircleHelp size={18}/><span>Centre d'aide</span></button><div className="pad-user"><span className="pad-avatar">{email.slice(0,2).toUpperCase()}</span><span className="pad-user-copy"><strong>Super Admin</strong><small>{email}</small></span><button className="pad-signout" aria-label="Se déconnecter" onClick={() => void onSignOut()}><LogOut size={15}/></button></div></div>
    </aside>
    <main className="pad-main">
      <header className="pad-topbar"><div className="pad-top-brand"><BrandLogo variant="light"/></div><span className="pad-top-context">Administration plateforme</span><div className="pad-search"><Search size={17}/><input aria-label="Recherche globale" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher dans la plateforme…"/><kbd>Ctrl K</kbd></div><div className="pad-top-actions"><button className="pad-icon-button" aria-label="Notifications" onClick={() => setNotice("Aucune notification plateforme connectée.")}><Bell size={18}/></button><button className="pad-icon-button" aria-label="Centre d'aide" onClick={() => setNotice("Le centre d'aide sera connecté ultérieurement.")}><CircleHelp size={18}/></button><button className="pad-theme-toggle" onClick={() => setDark(!dark)} aria-label={dark ? "Activer le thème clair" : "Activer le thème sombre"}>{dark ? <Moon size={16}/> : <Sun size={16}/>}</button><span className="pad-operator"><span className="pad-avatar">{email.slice(0,2).toUpperCase()}</span><span><strong>Super Admin</strong><small>Plateforme ZENOX</small></span><ChevronDown size={14}/></span></div></header>
      <div className="pad-content">
        <div className="pad-page-heading"><div><div className="pad-eyebrow"><ShieldCheck size={14}/> CONSOLE D'ADMINISTRATION ZENOX FINANCE</div><h1>{titles[section]}</h1><p>{descriptions[section]}</p></div><div className="pad-heading-actions"><span className="pad-live"><i/> Session sécurisée</span><button className="pad-refresh-button" onClick={refresh} disabled={loading}><RefreshCw size={14}/> Actualiser</button></div></div>
        {notice && <div className="pad-notice" role="status">{notice}<button onClick={() => setNotice("")} aria-label="Fermer"><X size={15}/></button></div>}
        {section === "dashboard" && <DashboardOverview organizations={organizations} requests={requests} organizationsError={organizationsError} requestsError={requestsError} loading={loading} activeCount={activeCount} pendingCount={pendingCount} onNavigate={selectSection} onRefresh={refresh}/>}
        {section === "orgs" && <OrganizationsWorkspace organizations={filteredOrganizations} total={organizations.length} loading={loading} error={organizationsError} statusFilter={statusFilter} setStatusFilter={setStatusFilter} onRefresh={refresh}/>}
        {section === "requests" && <section className="pad-module"><div className="pad-module-tools"><div><h2>Demandes d'inscription</h2><p>{requests.length} demande(s) en attente accessibles à l'opérateur.</p></div><span className="pad-source-label">API sécurisée · données réelles</span></div>{requestsError ? <ErrorState message={requestsError} onRetry={refresh}/> : <PlatformReviewWorkspace key={refreshKey} searchQuery={query}/>}</section>}
        {section === "kyc" && <ModuleWorkspace icon={FileCheck2} title="Conformité & KYC" source="Revue documentaire existante" description="Les documents déposés sont examinés depuis le dossier de chaque demande d'inscription." features={["Liste des pièces par demande","Acceptation ou rejet motivé","Historique de revue documentaire","Synthèse de conformité par organisation"]} note="La vue consolidée KYC et ses indicateurs nécessitent un endpoint global dédié." onGo={() => selectSection("requests")} action="Ouvrir les inscriptions"/>}
        {section === "analytics" && <ModuleWorkspace icon={BarChart3} title="Analytics & rapports" source="Agrégats à développer" description="Les indicateurs seront alimentés par des agrégats calculés côté serveur, sans exposition des données financières détaillées des tenants." features={["Croissance des organisations","Évolution des utilisateurs actifs","Répartition géographique","Tendances des opérations et revenus"]} note="Aucune série historique consolidée n'est actuellement exposée par l'API : les graphiques restent volontairement non simulés."/>}
        {section === "users" && <ModuleWorkspace icon={Users} title="Utilisateurs & permissions" source="API globale à développer" description="Répertoire central des identités et de leurs rattachements aux organisations." features={["Recherche d'identité et d'adresse e-mail","Organisations et rôles associés","Statut d'accès et dates d'activité","Gestion contrôlée des permissions"]} note="Les API existantes gèrent les membres au niveau d'un tenant, mais pas encore le répertoire global plateforme."/>}
        {section === "operations" && <ModuleWorkspace icon={ArrowLeftRight} title="Opérations financières" source="Agrégats globaux à développer" description="Supervision transversale des opérations sans contourner l'isolation multi-tenant." features={["Référence et organisation","Type, devise et montant","Statut et horodatage","Détection des opérations en anomalie"]} note="Aucun flux global d'opérations n'est actuellement exposé à l'administration plateforme."/>}
        {section === "revenue" && <ModuleWorkspace icon={CreditCard} title="Facturation & revenus" source="Indicateurs plateforme à définir" description="Suivi des revenus propres à ZENOX Finance, distincts des factures émises par ses organisations clientes." features={["Abonnements et plans","Factures de la plateforme","Paiements reçus et impayés","Revenus récurrents et historiques"]} note="Les données de facturation tenant ne doivent pas être assimilées aux revenus de la plateforme."/>}
        {section === "audit" && <ModuleWorkspace icon={Activity} title="Journal d'audit" source="Module audit à implémenter" description="Traçabilité consultable des actions privilégiées et des événements sensibles." features={["Acteur et rôle","Action et ressource concernée","Date, résultat et corrélation","Filtres et export des événements"]} note="Le module backend audit est actuellement un squelette : aucun journal global n'est présenté comme disponible."/>}
        {section === "health" && <ModuleWorkspace icon={Server} title="Santé & surveillance" source="Contrôles techniques partiels" description="État de disponibilité des composants critiques de la plateforme." features={["API et base de données","Stockage documentaire","Authentification","Latence, erreurs et disponibilité"]} note="Les endpoints de santé existants vérifient l'API et la connexion DB. Les métriques avancées ne sont pas encore collectées."/>}
        {section === "security" && <ModuleWorkspace icon={LockKeyhole} title="Administrateurs & sécurité" source="Contrôle opérateur existant" description="Administration des accès privilégiés, avec séparation des responsabilités." features={["Liste des opérateurs plateforme","Rôles et habilitations","Sessions et événements sensibles","Révocation contrôlée des accès"]} note="L'autorisation d'opérateur existe. La gestion complète des administrateurs et des sessions reste à développer."/>}
        {section === "settings" && <ModuleWorkspace icon={Settings2} title="Paramètres plateforme" source="Configuration à structurer" description="Centralisation des paramètres globaux et des référentiels." features={["Identité et coordonnées plateforme","Devises et référentiels","Notifications et modèles","Intégrations et maintenance"]} note="Les changements de configuration devront être validés, journalisés et limités aux administrateurs autorisés."/>}
        <footer className="pad-footer"><span>© 2026 ZENOX Finance</span><span><ShieldCheck size={13}/> Administration sécurisée · Isolation multi-tenant</span><span>Platform Console V3</span></footer>
      </div>
    </main>
  </div>;
}

function DashboardOverview({ organizations, requests, organizationsError, requestsError, loading, activeCount, pendingCount, onNavigate, onRefresh }: {
  organizations: PlatformOrganization[]; requests: RequestItem[]; organizationsError: string; requestsError: string;
  loading: boolean; activeCount: number; pendingCount: number; onNavigate: (section: Section) => void; onRefresh: () => void;
}) {
  const metrics = [
    { label: "Organisations", value: loading ? "…" : organizationsError ? "—" : String(organizations.length), hint: loading ? "Chargement" : "Répertoire global", icon: Building2, tone: "blue" },
    { label: "Organisations actives", value: loading ? "…" : organizationsError ? "—" : String(activeCount), hint: "Statut ACTIVE", icon: CheckCircle2, tone: "green" },
    { label: "Inscriptions en attente", value: loading ? "…" : requestsError ? "—" : String(pendingCount), hint: "File de revue", icon: ClipboardList, tone: "violet" },
    { label: "Opérations financières", value: "—", hint: "API globale à connecter", icon: ArrowLeftRight, tone: "orange" },
    { label: "Revenus plateforme", value: "—", hint: "Agrégats à développer", icon: CreditCard, tone: "cyan" },
  ];
  const recentOrganizations = [...organizations].sort((a,b) => b.createdAt.localeCompare(a.createdAt)).slice(0,5);
  return <>
    <section className="pad-metrics">{metrics.map(({label,value,hint,icon:Icon,tone}) => <article className="pad-metric" key={label}><div className={`pad-metric-icon ${tone}`}><Icon size={19}/></div><div className="pad-metric-copy"><span>{label}</span><strong>{value}</strong><small>{hint}</small></div></article>)}</section>
    <div className="pad-overview-grid">
      <section className="pad-panel pad-chart-panel"><div className="pad-panel-heading"><div><h2><BarChart3 size={16}/> Évolution des organisations</h2><p>Historique consolidé des créations et activations.</p></div><span className="pad-source-label">Série historique à connecter</span></div><div className="pad-chart-empty"><BarChart3 size={28}/><strong>Historique indisponible</strong><span>Le répertoire actuel fournit les états, mais pas encore les séries temporelles.</span></div></section>
      <section className="pad-panel"><div className="pad-panel-heading"><div><h2>Répartition par statut</h2><p>Organisations du répertoire global</p></div><Building2 size={18}/></div><div className="pad-status-summary">{(["ACTIVE","PENDING","SUSPENDED","DISABLED"] as const).map((status) => <div key={status}><span className={`pad-status-dot ${status.toLowerCase()}`}/><span>{statusLabel(status)}</span><strong>{loading || organizationsError ? "—" : organizations.filter((item) => item.status === status).length}</strong></div>)}</div></section>
      <section className="pad-panel pad-health-panel"><div className="pad-panel-heading"><div><h2><ShieldCheck size={16}/> Santé de la plateforme</h2><p>Contrôles réellement disponibles</p></div><span className="pad-source-label">Contrôle partiel</span></div><div className="pad-health-line"><CheckCircle2 size={16}/><span>API Finance</span><b>Connectée à la session</b></div><div className="pad-health-line"><Server size={16}/><span>Base de données</span><b>Contrôle DB disponible</b></div><div className="pad-health-line muted"><Activity size={16}/><span>Stockage & métriques</span><b>Non mesurés</b></div></section>
    </div>
    <div className="pad-lower-grid">
      <section className="pad-panel"><div className="pad-panel-heading"><div><h2><Building2 size={16}/> Organisations enregistrées</h2><p>{organizationsError ? "Répertoire indisponible" : `${organizations.length} organisation(s) · Lecture seule`}</p></div><button className="pad-text-button" onClick={() => onNavigate("orgs")}>Voir toutes <ChevronRight size={15}/></button></div>{organizationsError ? <ErrorState message={organizationsError} onRetry={onRefresh}/> : loading ? <div className="pad-empty-row">Chargement du répertoire…</div> : recentOrganizations.length === 0 ? <div className="pad-empty-row">Aucune organisation enregistrée.</div> : <div className="pad-table-scroll"><table className="pad-table"><thead><tr><th>Organisation</th><th>Pays</th><th>Devise</th><th>Statut</th></tr></thead><tbody>{recentOrganizations.map((item) => <tr key={item.id}><td><strong>{item.legalName}</strong><small>{item.tenantCode}</small></td><td>{item.countryCode}</td><td>{item.defaultCurrency}</td><td><StatusBadge status={item.status}/></td></tr>)}</tbody></table></div>}</section>
      <section className="pad-panel"><div className="pad-panel-heading"><div><h2><ClipboardList size={16}/> Inscriptions récentes</h2><p>Demandes en attente accessibles à l'opérateur.</p></div><button className="pad-text-button" onClick={() => onNavigate("requests")}>Voir tout <ChevronRight size={15}/></button></div>{requestsError ? <ErrorState message={requestsError} onRetry={onRefresh}/> : loading ? <div className="pad-empty-row">Chargement des demandes…</div> : requests.length === 0 ? <div className="pad-empty-row">Aucune demande en attente.</div> : <div className="pad-recent-list">{requests.slice(0,5).map((item) => <div className="pad-recent-item" key={item.id}><span className="pad-recent-check"><ClipboardList size={16}/></span><div><strong>{item.legalName}</strong><small>{item.countryCode} · Reçue le {formatDate(item.submittedAt)}</small></div><span className="pad-status pending">À examiner</span></div>)}</div>}</section>
    </div>
    <section className="pad-panel pad-activity-panel"><div className="pad-panel-heading"><div><h2><Activity size={16}/> Activité de la plateforme</h2><p>Événements récents du journal d'audit.</p></div><span className="pad-source-label">Journal global à connecter</span></div><div className="pad-empty-row">Le module d'audit global n'est pas encore implémenté. Aucun événement fictif n'est affiché.</div></section>
  </>;
}
function OrganizationsWorkspace({ organizations, total, loading, error, statusFilter, setStatusFilter, onRefresh }: {
  organizations: PlatformOrganization[]; total: number; loading: boolean; error: string; statusFilter: string; setStatusFilter: (value: string) => void; onRefresh: () => void;
}) {
  return <section className="pad-module"><div className="pad-module-tools"><div><h2>Répertoire global</h2><p>{total} organisation(s) · Données issues de l'API plateforme sécurisée.</p></div><div className="pad-module-actions"><span className="pad-source-label">Lecture seule</span><button className="pad-refresh-button" onClick={onRefresh} disabled={loading}><RefreshCw size={14}/> Actualiser</button></div></div><div className="pad-filterbar"><label>Statut <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="ALL">Tous les statuts</option><option value="ACTIVE">Active</option><option value="PENDING">En attente</option><option value="SUSPENDED">Suspendue</option><option value="DISABLED">Désactivée</option></select></label><span>{organizations.length} résultat(s)</span></div>{error ? <ErrorState message={error} onRetry={onRefresh}/> : loading ? <div className="pad-empty-row">Chargement des organisations…</div> : organizations.length === 0 ? <div className="pad-empty-row">Aucune organisation ne correspond aux filtres.</div> : <div className="pad-table-scroll"><table className="pad-table"><thead><tr><th>Organisation</th><th>Code</th><th>Pays</th><th>Devise</th><th>Statut</th><th>Créée le</th></tr></thead><tbody>{organizations.map((item) => <tr key={item.id}><td><strong>{item.legalName}</strong><small>{item.id}</small></td><td>{item.tenantCode}</td><td>{item.countryCode}</td><td>{item.defaultCurrency}</td><td><StatusBadge status={item.status}/></td><td>{formatDate(item.createdAt)}</td></tr>)}</tbody></table></div>}</section>;
}
function StatusBadge({ status }: { status: string }) { return <span className={`pad-status ${status.toLowerCase()}`}>{statusLabel(status)}</span>; }
function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) { return <div className="pad-inline-error" role="alert"><span>{message}</span><button className="pad-refresh-button" onClick={onRetry}>Réessayer</button></div>; }
function ModuleWorkspace({ icon: Icon, title, source, description, features, note, action, onGo }: {
  icon: LucideIcon; title: string; source: string; description: string; features: string[]; note: string; action?: string; onGo?: () => void;
}) {
  return <section className="pad-module-page"><div className="pad-module-intro"><div className="pad-placeholder-icon"><Icon size={25}/></div><div><span className="pad-source-label">{source}</span><h2>{title}</h2><p>{description}</p></div>{action && onGo && <button className="pad-refresh-button" onClick={onGo}>{action} <ChevronRight size={14}/></button>}</div><div className="pad-feature-grid">{features.map((feature,index) => <article className="pad-feature-card" key={feature}><span className="pad-feature-number">{String(index+1).padStart(2,"0")}</span><strong>{feature}</strong><span>Composant prévu dans le périmètre de la console.</span></article>)}</div><div className="pad-module-note"><ShieldCheck size={17}/><p>{note}</p></div></section>;
}
