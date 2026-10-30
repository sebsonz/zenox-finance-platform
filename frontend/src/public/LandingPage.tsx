import { useState } from "react";
import {
  ArrowRight, BadgeCheck, CheckCircle2, ChevronDown, FileCheck2, FileText,
  Globe2, Layers3, LockKeyhole, Menu, ShieldCheck, Users, X,
} from "lucide-react";
import "./landing.css";

type LandingPageProps = {
  onLogin: () => void;
  onCreateAccount: () => void;
};

const solutions = [
  { icon: FileText, number: "01", title: "Facturation internationale", description: "Préparez vos factures, gérez les brouillons et suivez leur cycle de vie dans un espace centralisé." },
  { icon: Layers3, number: "02", title: "Clients & relations", description: "Organisez les fiches clients, les contacts et les adresses dans un répertoire propre à votre organisation." },
  { icon: Globe2, number: "03", title: "Devises & fiscalité", description: "Une architecture prévue pour les devises et les règles fiscales versionnées, avec validation côté serveur." },
  { icon: WalletCards, number: "04", title: "Paiements & comptabilité", description: "Des domaines séparés pour les paiements, les allocations et les écritures comptables, intégrés progressivement." },
];

const principles = [
  { icon: LockKeyhole, title: "Isolation des organisations", description: "Les accès et les données sont limités au tenant autorisé par le backend." },
  { icon: BadgeCheck, title: "Traçabilité des opérations", description: "Les opérations sensibles suivent des contrats et des règles d'audit propres à leur domaine." },
  { icon: Layers3, title: "Architecture modulaire", description: "Chaque domaine possède ses responsabilités, ses services et ses contrats d'API." },
];

const faqs = [
  { question: "À qui s’adresse ZENOX Finance ?", answer: "Aux organisations qui souhaitent structurer leur facturation et centraliser progressivement leurs opérations financières dans un espace de travail dédié." },
  { question: "Puis-je gérer plusieurs devises ?", answer: "La plateforme est conçue pour s'appuyer sur un référentiel centralisé de devises. La disponibilité effective dépend des fonctionnalités activées dans votre espace." },
  { question: "Mes données sont-elles séparées de celles des autres entreprises ?", answer: "Oui. L'architecture applique un contexte tenant et des contrôles d'accès côté serveur et base de données. L'interface ne décide jamais seule des autorisations." },
  { question: "Les paiements et la comptabilité sont-ils déjà disponibles ?", answer: "Ces domaines font partie de l'architecture cible et sont intégrés progressivement. Les écrans n'affichent pas de chiffres fictifs pour les fonctions qui ne sont pas encore connectées." },
  { question: "Comment commencer ?", answer: "Créez votre compte, confirmez votre adresse e-mail puis suivez le parcours de création de votre organisation." },
];

export function LandingPage({ onLogin, onCreateAccount }: LandingPageProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const closeMenu = () => setMobileMenuOpen(false);

  return (
    <main className="zf-landing">
      <header className="zf-header">
        <a className="zf-brand" href="#accueil" aria-label="ZENOX Finance, accueil" onClick={closeMenu}>
          <span className="zf-brand-mark">Z</span>
          <span className="zf-brand-name">ZENOX <b>FINANCE</b></span>
        </a>
        <button className="zf-mobile-toggle" type="button" aria-label={mobileMenuOpen ? "Fermer le menu" : "Ouvrir le menu"} aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen((open) => !open)}>
          {mobileMenuOpen ? <X size={21}/> : <Menu size={21}/>}
        </button>
        <nav className={mobileMenuOpen ? "zf-nav zf-nav-open" : "zf-nav"} aria-label="Navigation principale">
          <a href="#solutions" onClick={closeMenu}>Solutions</a>
          <a href="#fonctionnalites" onClick={closeMenu}>Fonctionnalités</a>
          <a href="#securite" onClick={closeMenu}>Sécurité</a>
          <a href="#tarification" onClick={closeMenu}>Tarification</a>
          <a href="#faq" onClick={closeMenu}>FAQ</a>
        </nav>
        <div className="zf-header-actions">
          <button className="zf-button zf-button-quiet" onClick={() => { closeMenu(); onLogin(); }}>Connexion</button>
          <button className="zf-button zf-button-primary" onClick={() => { closeMenu(); onCreateAccount(); }}>Créer un compte <ArrowRight size={16}/></button>
        </div>
      </header>

      <section className="zf-hero" id="accueil">
        <div className="zf-hero-copy">
          <div className="zf-eyebrow"><span className="zf-eyebrow-dot"/> FINANCE · FACTURATION · PILOTAGE</div>
          <h1>Vos opérations financières.<br/><span>Une vision plus claire.</span></h1>
          <p className="zf-hero-description">ZENOX Finance est une plateforme de gestion financière conçue pour organiser la facturation, les relations clients et les processus financiers de votre organisation, avec une architecture modulaire et sécurisée.</p>
          <div className="zf-hero-actions">
            <button className="zf-button zf-button-primary zf-button-large" onClick={onCreateAccount}>Créer mon espace <ArrowRight size={18}/></button>
            <button className="zf-button zf-button-outline zf-button-large" onClick={onLogin}>Accéder à mon compte</button>
          </div>
          <div className="zf-trust-line"><CheckCircle2 size={16}/> API-first <span/> Multi-tenant <span/> Conçu pour évoluer</div>
        </div>
        <div className="zf-hero-visual" aria-label="Aperçu illustratif de l'espace financier">
          <div className="zf-orbit zf-orbit-one"/><div className="zf-orbit zf-orbit-two"/>
          <div className="zf-dashboard-card">
            <div className="zf-dashboard-top"><span className="zf-mini-mark">Z</span><span>ESPACE FINANCIER</span><i/></div>
            <div className="zf-dashboard-heading"><div><small>VUE D’ENSEMBLE</small><h2>Votre activité</h2></div><span className="zf-demo-label">APERÇU</span></div>
            <div className="zf-dashboard-metrics">
              <div><span>Factures émises</span><strong>—</strong><small>Indicateur de votre espace</small></div>
              <div><span>Clients</span><strong>—</strong><small>Répertoire de l'organisation</small></div>
            </div>
            <div className="zf-chart-panel"><div className="zf-chart-caption"><span>Activité financière</span><small>APERÇU VISUEL</small></div><div className="zf-chart-bars" aria-hidden="true">{[34,53,42,68,48,79,60,91,66,74,51,85].map((height,index)=><i key={index} style={{height:height+"%"}}/>)}</div><div className="zf-chart-axis"><span>Début de période</span><span>Fin de période</span></div></div>
            <div className="zf-dashboard-foot"><ShieldCheck size={15}/> Les indicateurs réels sont chargés depuis les API autorisées.</div>
          </div>
          <div className="zf-floating-note"><FileCheck2 size={17}/><span><b>Un espace structuré</b><small>Des modules reliés par des contrats clairs</small></span></div>
        </div>
      </section>

      <section className="zf-proof-strip" aria-label="Principes de la plateforme">
        <span><ShieldCheck size={17}/> Sécurité par conception</span>
        <span><Layers3 size={17}/> Architecture modulaire</span>
        <span><Globe2 size={17}/> Vision internationale</span>
        <span><FileCheck2 size={17}/> Données vérifiables</span>
      </section>

      <section className="zf-section" id="solutions">
        <div className="zf-section-heading"><div className="zf-eyebrow">UNE PLATEFORME POUR VOS PROCESSUS</div><h2>Les fonctions financières, organisées par domaine.</h2><p>Un socle commun et des modules spécialisés qui évoluent sans mélanger leurs responsabilités.</p></div>
        <div className="zf-solution-grid">{solutions.map(({icon:Icon,number,title,description})=><article className="zf-solution-card" key={number}><div className="zf-solution-top"><span className="zf-capability-icon"><Icon size={21}/></span><small>{number}</small></div><h3>{title}</h3><p>{description}</p></article>)}</div>
      </section>

      <section className="zf-section zf-feature-section" id="fonctionnalites">
        <div className="zf-section-heading"><div className="zf-eyebrow">UN ESPACE DE TRAVAIL UNIFIÉ</div><h2>Une expérience pensée pour le quotidien.</h2><p>Les outils disponibles s'appuient sur les mêmes règles d'identité, de tenant et de contrôle des accès.</p></div>
        <div className="zf-feature-grid">
          <article className="zf-feature-card zf-feature-large"><div className="zf-feature-icon"><FileText size={22}/></div><span>FACTURATION</span><h3>Du brouillon à l'émission.</h3><p>Préparez les documents, contrôlez les informations et respectez le cycle de vie de vos factures.</p><ul><li>Gestion des brouillons</li><li>Snapshots fiscaux</li><li>Documents d'émission</li></ul></article>
          <article className="zf-feature-card"><div className="zf-feature-icon"><Users size={22}/></div><span>RELATION CLIENT</span><h3>Un répertoire organisé.</h3><p>Clients, contacts et adresses restent rattachés à la bonne organisation.</p></article>
          <article className="zf-feature-card"><div className="zf-feature-icon"><Globe2 size={22}/></div><span>RÉFÉRENTIELS</span><h3>Des règles explicites.</h3><p>Devises, formats et règles fiscales sont gérés par des domaines spécialisés.</p></article>
        </div>
      </section>

      <section className="zf-security-section" id="securite">
        <div className="zf-security-copy"><div className="zf-eyebrow">SÉCURITÉ PAR CONCEPTION</div><h2>Chaque organisation travaille dans son propre périmètre.</h2><p>La session identifie l'utilisateur. Le backend vérifie son appartenance et ses permissions. La base de données applique ses propres protections. L'interface ne remplace jamais ces contrôles.</p><button className="zf-text-link" onClick={onCreateAccount}>Créer un espace sécurisé <ArrowRight size={16}/></button></div>
        <div className="zf-principles">{principles.map(({icon:Icon,title,description})=><article key={title}><span><Icon size={19}/></span><div><h3>{title}</h3><p>{description}</p></div></article>)}</div>
      </section>

      <section className="zf-pricing-section" id="tarification">
        <div className="zf-section-heading"><div className="zf-eyebrow">OFFRES & TARIFICATION</div><h2>Une tarification claire, publiée avant le lancement.</h2><p>Les formules commerciales sont en cours de définition. Nous préférons publier des prix vérifiés plutôt que d'afficher des tarifs provisoires.</p></div>
        <div className="zf-pricing-card"><div className="zf-pricing-icon"><Layers3 size={22}/></div><div><strong>Offres ZENOX Finance</strong><p>Les niveaux de service, limites et fonctionnalités incluses seront présentés ici après validation de la grille tarifaire.</p></div><span className="zf-coming-pill">EN PRÉPARATION</span></div>
      </section>

      <section className="zf-faq-section" id="faq">
        <div className="zf-section-heading"><div className="zf-eyebrow">QUESTIONS FRÉQUENTES</div><h2>Les réponses essentielles.</h2><p>Quelques repères sur le fonctionnement et le périmètre de la plateforme.</p></div>
        <div className="zf-faq-list">{faqs.map(({question,answer})=><details className="zf-faq-item" key={question}><summary>{question}<ChevronDown size={18}/></summary><p>{answer}</p></details>)}</div>
      </section>

      <section className="zf-final-cta"><div><div className="zf-eyebrow">PASSEZ À UN ESPACE PLUS STRUCTURÉ</div><h2>Prêt à organiser vos opérations financières ?</h2><p>Créez votre compte et suivez le parcours de configuration de votre organisation.</p></div><button className="zf-button zf-button-primary zf-button-large" onClick={onCreateAccount}>Commencer maintenant <ArrowRight size={18}/></button></section>

      <footer className="zf-footer"><a className="zf-brand" href="#accueil"><span className="zf-brand-mark">Z</span><span className="zf-brand-name">ZENOX <b>FINANCE</b></span></a><span>© 2026 ZENOX Finance</span><span>Finance indépendante · API-first</span><button className="zf-footer-login" onClick={onLogin}>Connexion</button></footer>
    </main>
  );
}
