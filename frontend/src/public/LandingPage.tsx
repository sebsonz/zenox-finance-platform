import { ArrowRight, CheckCircle2, FileText, Globe2, ShieldCheck, WalletCards, Zap } from "lucide-react";
import "./landing.css";

type LandingPageProps = {
  onLogin: () => void;
  onCreateAccount: () => void;
};

const capabilities = [
  { icon: FileText, title: "Facturation structurée", description: "Préparez et suivez vos factures dans un espace organisé, conçu pour évoluer avec votre activité." },
  { icon: Globe2, title: "Gestion multi-devise", description: "Centralisez vos opérations et préparez les flux financiers pour plusieurs devises." },
  { icon: ShieldCheck, title: "Accès contrôlés", description: "Une architecture pensée pour isoler les organisations et contrôler les accès côté serveur." },
  { icon: WalletCards, title: "Opérations connectées", description: "Une base modulaire pour relier facturation, paiements, fiscalité et comptabilité." },
];

export function LandingPage({ onLogin, onCreateAccount }: LandingPageProps) {
  return (
    <main className="zf-landing">
      <header className="zf-header">
        <a className="zf-brand" href="/" aria-label="ZENOX Finance, accueil">
          <span className="zf-brand-mark">Z</span>
          <span className="zf-brand-name">ZENOX <b>FINANCE</b></span>
        </a>
        <nav className="zf-nav" aria-label="Navigation principale">
          <a href="#fonctionnalites">Fonctionnalités</a>
          <a href="#securite">Sécurité</a>
          <a href="#approche">Notre approche</a>
        </nav>
        <div className="zf-header-actions">
          <button className="zf-button zf-button-quiet" onClick={onLogin}>Connexion</button>
          <button className="zf-button zf-button-primary" onClick={onCreateAccount}>Créer un compte <ArrowRight size={16}/></button>
        </div>
      </header>

      <section className="zf-hero">
        <div className="zf-hero-copy">
          <div className="zf-eyebrow"><span className="zf-eyebrow-dot"/> LA GESTION FINANCIÈRE, PLUS CLAIRE</div>
          <h1>Votre activité avance.<br/><span>Vos finances suivent.</span></h1>
          <p className="zf-hero-description">ZENOX Finance construit un espace unifié pour structurer la facturation et préparer la gestion financière de votre organisation.</p>
          <div className="zf-hero-actions">
            <button className="zf-button zf-button-primary zf-button-large" onClick={onCreateAccount}>Commencer <ArrowRight size={18}/></button>
            <button className="zf-button zf-button-outline zf-button-large" onClick={onLogin}>J’ai déjà un compte</button>
          </div>
          <div className="zf-trust-line"><CheckCircle2 size={16}/> Conçu pour les organisations <span/> Architecture évolutive</div>
        </div>
        <div className="zf-hero-visual" aria-label="Aperçu illustratif du tableau de bord">
          <div className="zf-orbit zf-orbit-one"/><div className="zf-orbit zf-orbit-two"/>
          <div className="zf-dashboard-card">
            <div className="zf-dashboard-top"><span className="zf-mini-mark">Z</span><span>ESPACE FINANCIER</span><i/></div>
            <div className="zf-dashboard-heading"><div><small>VUE D’ENSEMBLE</small><h2>Activité financière</h2></div><span className="zf-demo-label">APERÇU</span></div>
            <div className="zf-dashboard-metrics">
              <div><span>Factures émises</span><strong>—</strong><small>Connecté à vos données</small></div>
              <div><span>Montant facturé</span><strong>—</strong><small>Selon vos opérations</small></div>
            </div>
            <div className="zf-chart-panel"><div className="zf-chart-caption"><span>Activité dans le temps</span><small>APERÇU VISUEL</small></div><div className="zf-chart-bars">{[34,53,42,68,48,79,60,91,66,74,51,85].map((height,index)=><i key={index} style={{height:height+"%"}}/>)}</div><div className="zf-chart-axis"><span>Début de période</span><span>Fin de période</span></div></div>
            <div className="zf-dashboard-foot"><ShieldCheck size={15}/> Les données réelles proviennent de votre espace sécurisé.</div>
          </div>
          <div className="zf-floating-note"><Zap size={17}/><span><b>Une base modulaire</b><small>Des modules connectés progressivement</small></span></div>
        </div>
      </section>

      <section className="zf-capabilities" id="fonctionnalites">
        <div className="zf-section-heading"><div className="zf-eyebrow">UN ESPACE, PLUSIEURS BESOINS</div><h2>Les outils essentiels, réunis progressivement.</h2><p>Une plateforme construite par modules, avec des responsabilités clairement séparées.</p></div>
        <div className="zf-capability-grid">{capabilities.map(({icon:Icon,title,description})=><article className="zf-capability-card" key={title}><span className="zf-capability-icon"><Icon size={21}/></span><h3>{title}</h3><p>{description}</p></article>)}</div>
      </section>

      <section className="zf-security" id="securite"><div className="zf-security-icon"><ShieldCheck size={24}/></div><div><div className="zf-eyebrow">SÉCURITÉ PAR CONCEPTION</div><h2>Vos données restent dans le périmètre de votre organisation.</h2><p>Les contrôles d’accès sont vérifiés côté serveur. L’interface accompagne le parcours sans remplacer les protections backend et base de données.</p></div></section>
      <section className="zf-approach" id="approche"><div><div className="zf-eyebrow">UNE CONSTRUCTION PROGRESSIVE</div><h2>Une fondation solide avant chaque nouvelle fonctionnalité.</h2><p>Chaque module est ajouté avec ses interfaces, ses services et ses validations, sans présenter des données de démonstration comme des résultats réels.</p></div><button className="zf-button zf-button-primary" onClick={onCreateAccount}>Découvrir votre espace <ArrowRight size={16}/></button></section>
      <footer className="zf-footer"><a className="zf-brand" href="/"><span className="zf-brand-mark">Z</span><span className="zf-brand-name">ZENOX <b>FINANCE</b></span></a><span>© 2026 ZENOX Finance</span><span>Finance indépendante · API-first</span></footer>
    </main>
  );
}
