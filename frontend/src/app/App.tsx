import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { Dashboard } from "../modules/dashboard/Dashboard.js";
import { TaxWorkspace } from "../modules/tax/TaxWorkspace.js";
import { ComingSoon } from "../shared/components/ComingSoon.js";
import { pageFromPath, pagePaths, type Page } from "./navigation.js";
import {
  Bell, Building2, ChevronDown, CircleHelp, CreditCard, FileText, Globe2, Users,
  LayoutDashboard, Menu, Search, Settings2, ShieldCheck, WalletCards, X
} from "lucide-react";
import { RegistrationWorkspace } from "../auth/RegistrationWorkspace.js";
import { PlatformEntryWorkspace } from "../auth/PlatformEntryWorkspace.js";
import { InvoiceWorkspace } from "../invoices/InvoiceWorkspace.js";
import { CustomersWorkspace } from "../features/customers/CustomersWorkspace.js";
import { PlatformReviewWorkspace } from "../platform/PlatformReviewWorkspace.js";
import { PlatformAdminDashboard } from "../platform/PlatformAdminDashboard.js";
import { LandingPage } from "../public/LandingPage.js";

type SessionUser = { id: string; email?: string; emailConfirmedAt?: string | null };
type ActiveTenant = { id: string; tenantCode: string; legalName: string; role: string };
async function readEntryData<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({})) as { data?: T; error?: { message?: string } };
  if (!response.ok || payload.data === undefined) {
    throw new Error(payload.error?.message ?? "Impossible de vérifier votre session.");
  }
  return payload.data;
}
const navigation: { id: Page; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Vue d’ensemble", icon: LayoutDashboard },
  { id: "invoices", label: "Factures", icon: FileText },
  { id: "customers", label: "Clients", icon: Users },
  { id: "payments", label: "Paiements", icon: CreditCard },
  { id: "tax", label: "Moteur fiscal", icon: Globe2 },
  { id: "settings", label: "Paramètres", icon: Settings2 },
  { id: "platform", label: "Demandes d’inscription", icon: ShieldCheck },
];

export function App() {
  const location = useLocation();
  const routerNavigate = useNavigate();
  const [entryChecking, setEntryChecking] = useState(true);
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [activeTenant, setActiveTenant] = useState<ActiveTenant | null>(null);
  const [isPlatformOperator, setIsPlatformOperator] = useState(false);
  const [entryError, setEntryError] = useState("");
  const [showOrganizationSetup, setShowOrganizationSetup] = useState(false);

  async function refreshEntry() {
    setEntryChecking(true);
    setEntryError("");
    try {
      const sessionResponse = await fetch("/api/v1/user/session", { credentials: "same-origin", cache: "no-store" });
      if (!sessionResponse.ok) {
        setSessionUser(null);
        setActiveTenant(null);
        setIsPlatformOperator(false);
        setShowOrganizationSetup(false);
        if (location.pathname !== "/") routerNavigate(pagePaths.dashboard, { replace: true });
        return;
      }
      const session = await readEntryData<SessionUser>(sessionResponse);
      setSessionUser(session);
      const tenantData = await readEntryData<{ tenants: ActiveTenant[] }>(
        await fetch("/api/v1/user/tenants", { credentials: "same-origin", cache: "no-store" }),
      );
      const nextTenant = tenantData.tenants?.[0] ?? null;
      setActiveTenant(nextTenant);
      const platformResponse = await fetch("/api/v1/user/platform/me", { credentials: "same-origin", cache: "no-store" });
      let nextIsPlatformOperator = false;
      if (platformResponse.ok) {
        const platformData = await readEntryData<{ isPlatformOperator: boolean }>(platformResponse);
        nextIsPlatformOperator = platformData.isPlatformOperator;
      }
      setIsPlatformOperator(nextIsPlatformOperator);
      if (!nextTenant && nextIsPlatformOperator) routerNavigate(pagePaths.platform, { replace: true });
      else if (page === "platform" && !nextIsPlatformOperator) routerNavigate(pagePaths.dashboard, { replace: true });
    } catch (error) {
      setSessionUser(null);
      setActiveTenant(null);
      setIsPlatformOperator(false);
      setShowOrganizationSetup(false);
      routerNavigate(pagePaths.dashboard, { replace: true });
      setEntryError(error instanceof Error ? error.message : "L’API Finance est inaccessible.");
    } finally {
      setEntryChecking(false);
    }
  }

  useEffect(() => { void refreshEntry(); }, []);

  const page = pageFromPath(location.pathname);

  useEffect(() => {
    if (!entryChecking && page === "platform" && !isPlatformOperator) {
      routerNavigate(pagePaths.dashboard, { replace: true });
    }
  }, [entryChecking, isPlatformOperator, page, routerNavigate]);

  const [mobileOpen, setMobileOpen] = useState(false);
  const [amount, setAmount] = useState("100000");
  const [currency, setCurrency] = useState("XOF");
  const [notice, setNotice] = useState("");

  const navigate = (next: Page) => { routerNavigate(pagePaths[next]); setMobileOpen(false); setNotice(""); };
  const visibleNavigation = isPlatformOperator
    ? (activeTenant ? navigation : navigation.filter((item) => item.id === "platform"))
    : navigation.filter((item) => item.id !== "platform");
  const title = visibleNavigation.find((item) => item.id === page)?.label ?? "Vue d’ensemble";

  if (entryChecking) return <main className="entry-loading"><div className="brand-mark">Z</div><p>Vérification sécurisée de votre espace…</p></main>;
  const authParams = new URLSearchParams(location.search);
  const authRequested = authParams.get("auth") === "1";
  const requestedMode = authParams.get("mode") === "signup" ? "signup" : "login";
  const hasAuthCallback = new URLSearchParams(location.hash.replace(/^#/, "")).has("access_token");

  if (!sessionUser && location.pathname === "/" && !authRequested && !hasAuthCallback) {
    return <LandingPage
      onLogin={() => routerNavigate("/?auth=1&mode=login")}
      onCreateAccount={() => routerNavigate("/?auth=1&mode=signup")}
    />;
  }
  if (!sessionUser) return <><RegistrationWorkspace user={null} initialMode={authRequested ? requestedMode : "login"} onSessionChanged={refreshEntry}/>{entryError && <div className="entry-error">{entryError}</div>}</>;
  if (!activeTenant && !isPlatformOperator && !sessionUser.emailConfirmedAt) {
    return <RegistrationWorkspace user={sessionUser} onSessionChanged={refreshEntry} />;
  }
  if (!activeTenant && !isPlatformOperator && !showOrganizationSetup) {
    return <PlatformEntryWorkspace
      user={sessionUser}
      onCreateOrganization={() => setShowOrganizationSetup(true)}
      onSessionChanged={refreshEntry}
    />;
  }
  if (!activeTenant && !isPlatformOperator) {
    return <><RegistrationWorkspace
      user={sessionUser}
      onSessionChanged={refreshEntry}
      onBackToEntry={() => setShowOrganizationSetup(false)}
    />{entryError && <div className="entry-error">{entryError}</div>}</>;
  }

  if (isPlatformOperator) return <PlatformAdminDashboard email={sessionUser.email ?? "admin"} onSignOut={async () => { await fetch("/api/v1/user/session", { method: "DELETE", credentials: "same-origin" }); await refreshEntry(); }} />;

  async function signOut() {
    await fetch("/api/v1/user/session", { method: "DELETE", credentials: "same-origin" });
    await refreshEntry();
  }

  return <div className="app-shell">
    {mobileOpen && <button className="mobile-scrim" aria-label="Fermer le menu" onClick={() => setMobileOpen(false)} />}
    <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
      <div className="brand"><div className="brand-mark">Z</div><div><strong>ZENOX<span>FINANCE</span></strong><small>Financial workspace</small></div><button className="close-menu" onClick={() => setMobileOpen(false)} aria-label="Fermer"><X size={18}/></button></div>
      <div className="workspace-label">ESPACE DE TRAVAIL</div>
      <button className="workspace-switch"><div className="workspace-avatar"><Building2 size={17}/></div><span><strong>{activeTenant?.legalName ?? "Administration plateforme"}</strong><small>{activeTenant?.role ?? "Opérateur plateforme"}</small></span><ChevronDown size={15}/></button>
      <div className="nav-label">MENU PRINCIPAL</div>
      <nav>{visibleNavigation.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => navigate(id)} className={`nav-item ${page === id ? "active" : ""}`}><Icon size={18}/><span>{label}</span>{id === "tax" && <span className="nav-tag">BETA</span>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="security-card"><ShieldCheck size={19}/><strong>Finance sécurisé</strong><p>Isolation des données et journalisation des opérations.</p><span><i/> Architecture multi-tenant</span></div><button className="nav-item help-link" onClick={() => setNotice("Le centre d’aide sera connecté dans une prochaine étape.")}><CircleHelp size={18}/> Centre d’aide</button><div className="user-row"><div className="user-avatar">{(sessionUser.email ?? "ZF").slice(0, 2).toUpperCase()}</div><span><strong>{sessionUser.email ?? "Utilisateur"}</strong><small>{activeTenant?.role ?? "Opérateur plateforme"}</small></span><ChevronDown size={15}/></div></div>
    </aside>

    <main className="main-area">
      <header className="topbar"><button className="mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Ouvrir le menu"><Menu size={20}/></button><div className="breadcrumbs">Workspace <span>/</span> <strong>{title}</strong></div><div className="top-actions"><div className="environment"><i/> Espace connecté</div><button className="icon-button" aria-label="Rechercher" onClick={() => setNotice("La recherche globale sera activée avec les modules de données.")}><Search size={18}/></button><button className="icon-button notification-button" aria-label="Notifications" onClick={() => setNotice("Aucune notification réelle : l’API n’est pas encore connectée.")}><Bell size={18}/><i/></button><button className="top-avatar" type="button" aria-label="Se déconnecter" title={sessionUser.email ?? "Se déconnecter"} onClick={() => void signOut()}>{(sessionUser.email ?? "ZF").slice(0, 2).toUpperCase()}</button></div></header>
      <div className="page-content">
        {notice && <div className="notice"><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Fermer"><X size={16}/></button></div>}
        {page === "dashboard" && activeTenant && <Dashboard onNavigate={navigate} tenantId={activeTenant.id}/>}
        {page === "tax" && <TaxWorkspace amount={amount} setAmount={setAmount} currency={currency} setCurrency={setCurrency} onSubmit={() => setNotice("Calcul non exécuté : connectez le formulaire à l’API Finance sécurisée avant tout calcul réel.")}/>}
        {page === "invoices" && <InvoiceWorkspace/>}
        {page === "customers" && activeTenant && <CustomersWorkspace tenantId={activeTenant.id}/>}
        {page === "payments" && <ComingSoon icon={WalletCards} title="Paiements & allocations" description="Les paiements, affectations et soldes seront servis par le backend Finance, avec idempotence et contrôle multi-tenant."/>}
        {page === "settings" && <ComingSoon icon={Settings2} title="Paramètres Finance" description="La configuration des organisations, devises et intégrations sera reliée aux services authentifiés."/>}
        {page === "platform" && isPlatformOperator && <PlatformReviewWorkspace/>}
        <footer><span>© 2026 ZENOX Finance</span><span><ShieldCheck size={13}/> Finance indépendante · API-first</span><span>Interface en construction</span></footer>
      </div>
    </main>
  </div>;
}

