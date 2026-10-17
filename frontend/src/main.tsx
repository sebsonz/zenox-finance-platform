import { useState, type ComponentType } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity, ArrowDownRight, ArrowUpRight, Bell, BookOpen, Building2, ChevronDown,
  CircleHelp, CreditCard, FileCheck2, FileText, Globe2, LayoutDashboard, Menu,
  Plus, Search, Settings2, ShieldCheck, SlidersHorizontal, Sparkles, WalletCards,
  X
} from "lucide-react";
import "./styles.css";

type Page = "dashboard" | "tax" | "invoices" | "payments" | "settings";
const navigation: { id: Page; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Vue d’ensemble", icon: LayoutDashboard },
  { id: "invoices", label: "Factures", icon: FileText },
  { id: "payments", label: "Paiements", icon: CreditCard },
  { id: "tax", label: "Moteur fiscal", icon: Globe2 },
  { id: "settings", label: "Paramètres", icon: Settings2 },
];

function WorkspaceApp() {
  const [page, setPage] = useState<Page>("dashboard");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [amount, setAmount] = useState("100000");
  const [currency, setCurrency] = useState("XOF");
  const [notice, setNotice] = useState("");

  const navigate = (next: Page) => { setPage(next); setMobileOpen(false); setNotice(""); };
  const title = navigation.find((item) => item.id === page)?.label ?? "Vue d’ensemble";

  return <div className="app-shell">
    {mobileOpen && <button className="mobile-scrim" aria-label="Fermer le menu" onClick={() => setMobileOpen(false)} />}
    <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
      <div className="brand"><div className="brand-mark">Z</div><div><strong>ZENOX<span>FINANCE</span></strong><small>Financial workspace</small></div><button className="close-menu" onClick={() => setMobileOpen(false)} aria-label="Fermer"><X size={18}/></button></div>
      <div className="workspace-label">ESPACE DE TRAVAIL</div>
      <button className="workspace-switch"><div className="workspace-avatar"><Building2 size={17}/></div><span><strong>Zenox Finance</strong><small>Organisation principale</small></span><ChevronDown size={15}/></button>
      <div className="nav-label">MENU PRINCIPAL</div>
      <nav>{navigation.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => navigate(id)} className={`nav-item ${page === id ? "active" : ""}`}><Icon size={18}/><span>{label}</span>{id === "tax" && <span className="nav-tag">BETA</span>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="security-card"><ShieldCheck size={19}/><strong>Finance sécurisé</strong><p>Isolation des données et journalisation des opérations.</p><span><i/> Architecture multi-tenant</span></div><button className="nav-item help-link" onClick={() => setNotice("Le centre d’aide sera connecté dans une prochaine étape.")}><CircleHelp size={18}/> Centre d’aide</button><div className="user-row"><div className="user-avatar">ZF</div><span><strong>Administrateur</strong><small>Équipe Finance</small></span><ChevronDown size={15}/></div></div>
    </aside>

    <main className="main-area">
      <header className="topbar"><button className="mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Ouvrir le menu"><Menu size={20}/></button><div className="breadcrumbs">Workspace <span>/</span> <strong>{title}</strong></div><div className="top-actions"><div className="environment"><i/> Environnement de démonstration</div><button className="icon-button" aria-label="Rechercher" onClick={() => setNotice("La recherche globale sera activée avec les modules de données.")}><Search size={18}/></button><button className="icon-button notification-button" aria-label="Notifications" onClick={() => setNotice("Aucune notification réelle : l’API n’est pas encore connectée.")}><Bell size={18}/><i/></button><div className="top-avatar">ZF</div></div></header>
      <div className="page-content">
        {notice && <div className="notice"><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Fermer"><X size={16}/></button></div>}
        {page === "dashboard" && <Dashboard onNavigate={navigate}/>}
        {page === "tax" && <TaxWorkspace amount={amount} setAmount={setAmount} currency={currency} setCurrency={setCurrency} onSubmit={() => setNotice("Calcul non exécuté : connectez le formulaire à l’API Finance sécurisée avant tout calcul réel.")}/>}
        {page === "invoices" && <ComingSoon icon={FileText} title="Factures" description="Le cycle de vie des factures, la numérotation et les versions immuables seront gérés par l’API ZENOX Finance."/>}
        {page === "payments" && <ComingSoon icon={WalletCards} title="Paiements & allocations" description="Les paiements, affectations et soldes seront servis par le backend Finance, avec idempotence et contrôle multi-tenant."/>}
        {page === "settings" && <ComingSoon icon={Settings2} title="Paramètres Finance" description="La configuration des organisations, devises et intégrations sera reliée aux services authentifiés."/>}
        <footer><span>© 2026 ZENOX Finance</span><span><ShieldCheck size={13}/> Finance indépendante · API-first</span><span>Interface en construction</span></footer>
      </div>
    </main>
  </div>;
}

function Dashboard({ onNavigate }: { onNavigate: (page: Page) => void }) {
  return <>
    <div className="welcome-row"><div><div className="eyebrow"><Sparkles size={14}/> VOTRE ESPACE FINANCIER</div><h1>Bonjour, bienvenue 👋</h1><p className="subtitle">Une vue claire sur les opérations financières de votre organisation.</p></div><button className="primary-button" onClick={() => onNavigate("invoices")}><Plus size={17}/> Nouvelle facture</button></div>
    <div className="demo-banner"><div className="demo-icon"><Activity size={19}/></div><div><strong>Aperçu de l’interface</strong><p>Les données ci-dessous sont fictives. Aucun compte financier réel n’est encore connecté.</p></div><span className="demo-pill">MODE DÉMO</span></div>
    <section className="metrics-grid">
      <Metric title="Factures émises" value="—" hint="En attente de connexion API" icon={FileText} tone="blue" trend="Données non disponibles"/>
      <Metric title="Encaissements" value="—" hint="En attente de connexion API" icon={WalletCards} tone="green" trend="Données non disponibles"/>
      <Metric title="Solde à recevoir" value="—" hint="En attente de connexion API" icon={ArrowDownRight} tone="amber" trend="Données non disponibles"/>
      <Metric title="Règles fiscales" value="—" hint="Référentiel non chargé" icon={Globe2} tone="violet" trend="À configurer"/>
    </section>
    <div className="content-grid">
      <section className="panel activity-panel"><div className="panel-heading"><div><h2>Activité financière</h2><p>Suivi des opérations récentes</p></div><button className="text-button" onClick={() => onNavigate("invoices")}>Voir les factures <ArrowUpRight size={15}/></button></div><div className="empty-state"><div className="empty-illustration"><FileCheck2 size={27}/></div><strong>Votre activité apparaîtra ici</strong><p>Les factures, paiements et mouvements seront affichés après connexion de l’API Finance.</p><button className="outline-button" onClick={() => onNavigate("invoices")}>Explorer les factures</button></div></section>
      <section className="panel quick-panel"><div className="panel-heading"><div><h2>Accès rapides</h2><p>Les outils essentiels</p></div><SlidersHorizontal size={17} className="muted-icon"/></div><button className="quick-link" onClick={() => onNavigate("tax")}><div className="quick-icon purple"><Globe2 size={18}/></div><span><strong>Calcul fiscal</strong><small>Règles versionnées et snapshots</small></span><ArrowUpRight size={16}/></button><button className="quick-link" onClick={() => onNavigate("invoices")}><div className="quick-icon blue"><FileText size={18}/></div><span><strong>Gestion des factures</strong><small>Cycle de vie et documents</small></span><ArrowUpRight size={16}/></button><button className="quick-link" onClick={() => onNavigate("payments")}><div className="quick-icon green"><CreditCard size={18}/></div><span><strong>Paiements</strong><small>Encaissements et allocations</small></span><ArrowUpRight size={16}/></button><div className="integration-note"><BookOpen size={17}/><p><strong>Prêt pour l’intégration</strong><br/>ZENOX FRET V2 sera le premier consommateur autorisé de la plateforme.</p></div></section>
    </div>
    <section className="bottom-note"><ShieldCheck size={17}/><span><strong>La source de vérité reste le backend.</strong> Les calculs monétaires, règles fiscales et écritures seront exécutés et contrôlés côté serveur.</span></section>
  </>;
}

function Metric({ title, value, hint, icon: Icon, tone, trend }: { title: string; value: string; hint: string; icon: typeof FileText; tone: string; trend: string }) {
  return <article className="metric-card"><div className="metric-top"><span>{title}</span><div className={`metric-icon ${tone}`}><Icon size={18}/></div></div><div className="metric-value">{value}</div><div className="metric-hint">{hint}</div><div className="metric-trend"><span className="trend-dot"/> {trend}</div></article>;
}

function TaxWorkspace({ amount, setAmount, currency, setCurrency, onSubmit }: { amount: string; setAmount: (v: string) => void; currency: string; setCurrency: (v: string) => void; onSubmit: () => void }) {
  return <>
    <div className="welcome-row"><div><div className="eyebrow"><Globe2 size={14}/> FISCALITÉ & CONFORMITÉ</div><h1>Moteur fiscal</h1><p className="subtitle">Préparez une demande de calcul fiscal et consultez les règles versionnées.</p></div><span className="status-chip"><i/> API non connectée</span></div>
    <div className="demo-banner"><div className="demo-icon"><ShieldCheck size={19}/></div><div><strong>Calcul réel désactivé</strong><p>Ce formulaire est une interface de préparation. Les taux, résultats et snapshots doivent provenir du backend authentifié.</p></div><span className="demo-pill">APERÇU UI</span></div>
    <div className="tax-layout">
      <section className="panel tax-form-panel"><div className="panel-heading"><div><h2>Paramètres du calcul</h2><p>Renseignez le contexte de l’opération</p></div><div className="form-step">01 <span>/ 02</span></div></div>
        <form onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
          <div className="form-grid"><label>Type de document<select defaultValue="INVOICE"><option value="INVOICE">Facture</option><option value="CREDIT_NOTE">Avoir</option><option value="DEBIT_NOTE">Note de débit</option><option value="RECEIPT">Reçu</option></select></label><label>Date fiscale<input type="date" defaultValue="2026-10-16"/></label>
          <label>Juridiction<select defaultValue=""><option value="">Sélectionner une juridiction</option><option value="BENIN">Bénin — à configurer</option><option value="OTHER">Autre juridiction configurée</option></select></label><label>Catégorie de transaction<select defaultValue="GOODS"><option value="GOODS">Biens</option><option value="SERVICES">Services</option><option value="FREIGHT">Transport / fret</option><option value="DIGITAL_SERVICES">Services numériques</option></select></label>
          <label>Devise<select value={currency} onChange={(event) => setCurrency(event.target.value)}><option value="XOF">XOF — Franc CFA BCEAO</option><option value="EUR">EUR — Euro</option><option value="USD">USD — Dollar américain</option></select></label><label>Montant de base<input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" required pattern="[0-9]+([.,][0-9]{1,4})?"/></label></div>
          <div className="form-warning"><ShieldCheck size={16}/><span>Le serveur déterminera la précision monétaire, les règles applicables et la politique d’arrondi.</span></div>
          <button className="primary-button submit-button" type="submit">Préparer le calcul <ArrowUpRight size={17}/></button>
        </form>
      </section>
      <section className="panel tax-result-panel"><div className="panel-heading"><div><h2>Résultat fiscal</h2><p>Disponible après connexion du service</p></div><div className="result-icon"><Activity size={18}/></div></div><div className="result-placeholder"><div className="result-art"><Globe2 size={29}/></div><strong>Aucun calcul exécuté</strong><p>Les montants HT, taxes et TTC seront calculés par le moteur Finance à partir des règles valides à la date fiscale.</p><div className="result-line"><span>Montant de base</span><strong>{amount || "—"} {currency}</strong></div><div className="result-line"><span>Total des taxes</span><strong>—</strong></div><div className="result-line total"><span>Total à payer</span><strong>—</strong></div><div className="snapshot-info"><ShieldCheck size={17}/><span>Un snapshot fiscal immuable sera enregistré côté serveur une fois le calcul validé.</span></div></div></section>
    </div>
    <section className="panel rules-placeholder"><div className="panel-heading"><div><h2>Référentiel des règles fiscales</h2><p>Les règles actives et leur provenance seront chargées depuis l’API.</p></div><button className="outline-button" onClick={onSubmit}><SlidersHorizontal size={15}/> Vérifier la connexion</button></div><div className="table-placeholder"><div><Globe2 size={18}/><span>Aucune règle affichée</span></div><span>Ne constitue pas une validation fiscale du Bénin ou d’une autre juridiction.</span></div></section>
  </>;
}

function ComingSoon({ icon: Icon, title, description }: { icon: typeof FileText; title: string; description: string }) {
  return <div className="coming-wrap"><div className="eyebrow"><Sparkles size={14}/> ZENOX FINANCE</div><h1>{title}</h1><p className="subtitle">{description}</p><section className="panel coming-panel"><div className="coming-icon"><Icon size={26}/></div><h2>Module en préparation</h2><p>L’interface est posée. La prochaine étape sera de connecter ce module aux services backend, avec authentification, contrôle des autorisations et isolation des tenants.</p><span className="status-chip"><i/> Non connecté à l’API</span></section></div>;
}


type PublicPage = "home" | "features";

function PublicSite() {
  const [page, setPage] = useState<PublicPage>(window.location.pathname === "/fonctionnalites" ? "features" : "home");
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = (next: PublicPage) => {
    setPage(next);
    setMenuOpen(false);
    const path = next === "features" ? "/fonctionnalites" : "/";
    window.history.pushState({}, "", path);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  return <div className="public-site">
    <header className="public-header">
      <a className="public-logo" href="/" onClick={(e) => { e.preventDefault(); navigate("home"); }} aria-label="ZENOX Finance, accueil">
        <img src="/brand/zenox-finance-logo.svg" alt="ZENOX Finance" />
      </a>
      <button className="public-mobile-toggle" aria-label={menuOpen ? "Fermer le menu" : "Ouvrir le menu"} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X/> : <Menu/>}</button>
      <nav className={menuOpen ? "public-nav public-nav-open" : "public-nav"} aria-label="Navigation principale">
        <button className={page === "home" ? "public-nav-active" : ""} onClick={() => navigate("home")}>Accueil</button>
        <button className={page === "features" ? "public-nav-active" : ""} onClick={() => navigate("features")}>Fonctionnalités</button>
        <a href="#secteurs" onClick={(e) => { e.preventDefault(); navigate("home"); setTimeout(() => document.getElementById("secteurs")?.scrollIntoView({behavior:"smooth"}), 0); }}>Secteurs</a>
        <a href="#securite" onClick={(e) => { e.preventDefault(); navigate("home"); setTimeout(() => document.getElementById("securite")?.scrollIntoView({behavior:"smooth"}), 0); }}>Sécurité</a>
      </nav>
      <div className="public-header-actions"><a className="public-login" href="/app">Se connecter</a><a className="public-cta" href="/app">Accéder à la plateforme <ArrowUpRight size={16}/></a></div>
    </header>
    {page === "home" ? <PublicHome onFeatures={() => navigate("features")} /> : <PublicFeatures onHome={() => navigate("home")} />}
    <footer className="public-footer"><a className="public-footer-brand" href="/" onClick={(e)=>{e.preventDefault();navigate("home");}}><img src="/brand/zenox-symbol.svg" alt="" /><strong>ZENOX Finance</strong></a><span>La gestion financière, réunie dans un seul espace.</span><span>© 2026 ZENOX Finance</span></footer>
  </div>;
}

function PublicHome({ onFeatures }: { onFeatures: () => void }) {
  return <main>
    <section className="public-hero">
      <div className="hero-copy">
        <div className="public-kicker"><span className="kicker-dot"/> UNE PLATEFORME FINANCIÈRE UNIFIÉE</div>
        <h1>Votre gestion financière.<br/><span>Plus claire. Plus simple.</span></h1>
        <p className="hero-description">ZENOX Finance réunit les outils de facturation, de suivi des paiements et de pilotage financier dans un espace conçu pour accompagner votre entreprise.</p>
        <div className="hero-actions"><a className="public-cta public-cta-large" href="/app">Découvrir la plateforme <ArrowUpRight size={18}/></a><button className="public-secondary" onClick={onFeatures}><BookOpen size={17}/> Explorer les fonctionnalités</button></div>
        <div className="hero-assurances"><span><ShieldCheck size={16}/> Accès contrôlés</span><span><Building2 size={16}/> Par organisation</span><span><Globe2 size={16}/> Pensé pour évoluer</span></div>
      </div>
      <div className="hero-visual">
        <div className="visual-orbit orbit-one"/><div className="visual-orbit orbit-two"/>
        <div className="finance-preview">
          <div className="preview-top"><img src="/brand/zenox-symbol.svg" alt=""/><strong>ZENOX <span>Finance</span></strong><div className="preview-user"><span/> Espace de démonstration</div></div>
          <div className="preview-content"><aside><b>Vue d’ensemble</b><span>Factures</span><span>Paiements</span><span>Rapports</span><span>Paramètres</span></aside><div className="preview-main"><small>VUE D’ENSEMBLE</small><h3>Votre activité financière</h3><div className="preview-stats"><div><span>Factures</span><b>—</b><i>À connecter</i></div><div><span>Paiements</span><b>—</b><i>À connecter</i></div><div><span>À recevoir</span><b>—</b><i>À connecter</i></div></div><div className="preview-chart"><div className="chart-title">Évolution de l’activité <span>Aperçu visuel</span></div><div className="chart-bars">{[32,48,40,66,54,78,61,88,70,96,76,100].map((h,i)=><i key={i} style={{height:h+"%"}} />)}</div><div className="chart-labels"><span>Jan.</span><span>Mar.</span><span>Mai</span><span>Juil.</span><span>Sep.</span><span>Nov.</span></div></div><div className="preview-bottom"><ShieldCheck size={15}/> Maquette illustrative — aucune donnée financière réelle</div></div></div>
        </div>
        <div className="floating-badge"><div><FileText size={18}/></div><span><strong>Facturation centralisée</strong><small>Un espace, une vue d’ensemble</small></span><CheckMark /></div>
      </div>
    </section>
    <section className="public-value-strip"><div><div className="value-icon value-blue"><FileText/></div><strong>Facturation</strong><span>Préparer le suivi des documents commerciaux.</span></div><div><div className="value-icon value-green"><CreditCard/></div><strong>Paiements</strong><span>Suivre les encaissements et montants dus.</span></div><div><div className="value-icon value-violet"><Activity/></div><strong>Pilotage</strong><span>Structurer les indicateurs de votre activité.</span></div><div><div className="value-icon value-orange"><Link2Icon/></div><strong>Intégrations</strong><span>Préparer la connexion à vos outils métier.</span></div></section>
    <section className="public-section public-feature-intro"><div className="section-copy"><div className="public-kicker">UNE BASE POUR VOTRE GESTION</div><h2>Les outils essentiels,<br/>dans un même environnement.</h2><p>Une plateforme pensée pour faire évoluer la gestion financière de votre entreprise, avec une architecture qui sépare les organisations et contrôle les accès.</p><button className="public-text-link" onClick={onFeatures}>Découvrir les fonctionnalités <ArrowUpRight size={17}/></button></div><div className="feature-card-grid"><FeatureCard icon={FileText} title="Facturation" description="Documents commerciaux et suivi des statuts." tone="blue"/><FeatureCard icon={CreditCard} title="Paiements" description="Visibilité sur les encaissements et les montants dus." tone="green"/><FeatureCard icon={CalculatorIcon} title="Comptabilité" description="Une base structurée pour les opérations comptables." tone="violet"/><FeatureCard icon={Activity} title="Rapports" description="Indicateurs et vues de pilotage à construire." tone="orange"/></div></section>
    <section className="public-sectors" id="secteurs"><div className="public-kicker">CONÇU POUR S’ADAPTER</div><h2>Une plateforme qui accompagne vos activités</h2><p>Une base financière commune pour des entreprises aux opérations différentes.</p><div className="sector-grid"><div><TruckIcon/><strong>Transport & logistique</strong><span>Préparer les flux financiers liés aux opérations de transport.</span></div><div><Building2/><strong>Commerce & distribution</strong><span>Centraliser les documents et le suivi des règlements.</span></div><div><BriefcaseIcon/><strong>Services & entreprises</strong><span>Organiser la facturation et les indicateurs de gestion.</span></div></div></section>
    <section className="public-security" id="securite"><div className="security-emblem"><ShieldCheck size={32}/></div><div><div className="public-kicker">SÉCURITÉ AU CŒUR DE L’ARCHITECTURE</div><h2>Chaque organisation, dans son espace autorisé.</h2><p>ZENOX Finance est conçu autour de l’authentification, des autorisations et de l’isolation des données. Les fonctionnalités sont activées progressivement après validation technique.</p></div><button className="public-secondary" onClick={onFeatures}>Voir les fonctionnalités <ArrowUpRight size={16}/></button></section>
    <PublicCallToAction />
  </main>;
}

function PublicFeatures({ onHome }: { onHome: () => void }) {
  const groups = [
    {title:"Facturation",intro:"Préparer et suivre les documents commerciaux dans un cycle cohérent.",icon:FileText,tone:"blue",items:[["Documents de facturation","Structurer les factures et leurs informations essentielles."],["Devis et avoirs","Prévoir les documents complémentaires au cycle de facturation."],["Statuts et historique","Suivre les étapes du document et conserver une trace des changements."],["Accès par organisation","Limiter la consultation aux organisations autorisées."]]},
    {title:"Paiements",intro:"Donner une vue organisée des règlements et des montants à recevoir.",icon:CreditCard,tone:"green",items:[["Suivi des encaissements","Visualiser les paiements enregistrés et les montants restant dus."],["Affectation aux factures","Prévoir le rapprochement entre paiements et documents."],["Rapprochement","Préparer les contrôles de cohérence avec les données bancaires."],["Alertes de suivi","Faire ressortir les opérations nécessitant une attention."]]},
    {title:"Comptabilité",intro:"Poser une base structurée pour les écritures et les états financiers.",icon:CalculatorIcon,tone:"violet",items:[["Journaux et écritures","Organiser les mouvements comptables avec une piste d’audit."],["Plan comptable","Prévoir une structure configurable selon le cadre applicable."],["États financiers","Préparer les vues de synthèse et les exports nécessaires."],["Gestion des taxes","Rattacher les règles fiscales à une juridiction et à une période."]]},
    {title:"Rapports & pilotage",intro:"Transformer les opérations validées en informations utiles à la décision.",icon:Activity,tone:"orange",items:[["Tableaux de bord","Rassembler les principaux indicateurs de gestion."],["Rapports personnalisés","Prévoir des filtres par période, organisation et catégorie."],["Export de données","Préparer des exports contrôlés pour l’analyse."],["Historique et traçabilité","Relier les opérations aux événements et aux autorisations."]]},
    {title:"Intégrations",intro:"Préparer les échanges avec les applications de l’écosystème ZENOX.",icon:WorkflowIcon,tone:"slate",items:[["API sécurisée","Définir des échanges contrôlés entre applications."],["Webhooks","Prévoir des notifications d’événements pour les systèmes autorisés."],["ZENOX FRET","Faire de ZENOX FRET le premier consommateur prévu, après validation de l’intégration."],["Import & export","Organiser les transferts de données avec contrôles."]]}
  ];
  return <main className="features-page"><section className="features-hero"><div className="public-kicker">FONCTIONNALITÉS</div><h1>Une vision plus claire<br/><span>de votre gestion financière.</span></h1><p>Découvrez les grands domaines fonctionnels prévus dans ZENOX Finance. Les modules et leurs connexions seront activés au fur et à mesure de leur validation.</p><button className="public-secondary" onClick={onHome}><ArrowDownRight size={17}/> Retour à l’accueil</button><div className="features-hero-art"><div className="art-orb"/><div className="art-card art-card-one"><FileText/><span><strong>Facturation</strong><small>Documents & statuts</small></span></div><div className="art-card art-card-two"><CreditCard/><span><strong>Paiements</strong><small>Suivi & affectations</small></span></div><div className="art-card art-card-three"><Activity/><span><strong>Pilotage</strong><small>Rapports & indicateurs</small></span></div><img src="/brand/zenox-symbol.svg" alt="Symbole ZENOX"/></div></section>
    <div className="feature-groups">{groups.map((group,index)=><section className="feature-group" key={group.title}><div className="feature-group-heading"><div className={"value-icon value-"+group.tone}><group.icon/></div><div><span>0{index+1} / MODULE</span><h2>{group.title}</h2><p>{group.intro}</p></div></div><div className="feature-detail-grid">{group.items.map(([title,description])=><article key={title}><CheckCircleIcon/><div><h3>{title}</h3><p>{description}</p></div></article>)}</div></section>)}</div>
    <section className="feature-disclaimer"><ShieldCheck/><p><strong>Une présentation transparente.</strong> Cette page décrit la direction fonctionnelle de la plateforme. Elle ne garantit pas que chaque capacité soit déjà disponible en production. Les fonctions sensibles, notamment la comptabilité et la fiscalité, nécessitent validation, configuration et tests spécifiques.</p></section><PublicCallToAction />
  </main>;
}

function FeatureCard({icon:Icon,title,description,tone}:{icon:ComponentType<{size?: number}>;title:string;description:string;tone:string}) { return <article className="public-feature-card"><div className={"value-icon value-"+tone}><Icon/></div><h3>{title}</h3><p>{description}</p></article>; }
function PublicCallToAction(){return <section className="public-final-cta"><img src="/brand/zenox-symbol.svg" alt=""/><div><h2>Prêt à découvrir ZENOX Finance ?</h2><p>Une plateforme en construction, pensée pour une gestion financière structurée.</p></div><a className="public-cta" href="/app">Accéder à la plateforme <ArrowUpRight size={16}/></a></section>}
function CheckMark(){return <span className="floating-check"><ShieldCheck size={15}/></span>}
function Link2Icon(){return <Activity/>}
function CalculatorIcon(){return <SlidersHorizontal/>}
function TruckIcon(){return <Building2/>}
function BriefcaseIcon(){return <Building2/>}
function WorkflowIcon(){return <Globe2/>}
function CheckCircleIcon(){return <ShieldCheck size={17}/>}

function App() { return window.location.pathname === "/app" ? <WorkspaceApp /> : <PublicSite />; }

createRoot(document.getElementById("root")!).render(<App />);