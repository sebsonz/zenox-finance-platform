import {
  ArrowRight, BarChart3, BellRing, BookOpen, Boxes, Building2, CheckCircle2,
  ChevronRight, Cloud, CreditCard, FileCheck2, FileText, Globe2, Headphones,
  Link2, LockKeyhole, Menu, PieChart, ReceiptText, ShieldCheck, Smartphone,
  Truck, Users, WalletCards, Webhook, X
} from "lucide-react";
import { useState } from "react";
import { BrandLogo } from "../shared/components/BrandLogo.js";
import "./landing.css";

type LandingPageProps = { onLogin: () => void; onCreateAccount: () => void };

const featureGroups = [
  { id: "facturation", title: "Facturation", intro: "Préparez et suivez vos documents commerciaux.", tone: "blue", items: [
    { icon: FileText, title: "Factures personnalisées", desc: "Des documents adaptés à votre identité." },
    { icon: ReceiptText, title: "Devis et avoirs", desc: "Structurez vos propositions et corrections." },
    { icon: BellRing, title: "Suivi des statuts", desc: "Visualisez les étapes de vos documents." },
    { icon: FileCheck2, title: "Documents structurés", desc: "Des données organisées et traçables." },
  ]},
  { id: "paiements", title: "Paiements", intro: "Préparez le suivi des encaissements et leur rapprochement.", tone: "green", items: [
    { icon: WalletCards, title: "Suivi des paiements", desc: "Retrouvez les paiements enregistrés." },
    { icon: CreditCard, title: "Méthodes de paiement", desc: "Une base conçue pour plusieurs moyens." },
    { icon: Link2, title: "Rapprochement", desc: "Reliez les paiements aux documents concernés." },
    { icon: BellRing, title: "Alertes et notifications", desc: "Gardez une vision claire des échéances." },
  ]},
  { id: "comptabilite", title: "Comptabilité", intro: "Construisez une lecture cohérente de votre activité.", tone: "violet", items: [
    { icon: BookOpen, title: "Journaux comptables", desc: "Préparez la traçabilité des mouvements." },
    { icon: PieChart, title: "États financiers", desc: "Organisez les données de synthèse." },
    { icon: Boxes, title: "Plan comptable", desc: "Une base adaptable aux référentiels applicables." },
    { icon: Globe2, title: "Gestion fiscale", desc: "Un périmètre fiscal configuré par juridiction." },
  ]},
  { id: "rapports", title: "Rapports", intro: "Analysez les informations disponibles dans votre espace.", tone: "red", items: [
    { icon: BarChart3, title: "Tableaux de bord", desc: "Une lecture synthétique de votre activité." },
    { icon: FileText, title: "Export de données", desc: "Préparez vos extractions et rapports." },
    { icon: PieChart, title: "Rapports personnalisés", desc: "Des vues adaptées à vos besoins." },
    { icon: ReceiptText, title: "Analyse des performances", desc: "Explorez les données par période et catégorie." },
  ]},
];

export function LandingPage({ onLogin, onCreateAccount }: LandingPageProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const closeMenu = () => setMobileMenuOpen(false);
  const scrollTo = (id: string) => { document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }); closeMenu(); };

  return (
    <main className="zf-landing">
      <header className="zf-header">
        <a className="zf-brand" href="#accueil" aria-label="ZENOX Finance, accueil" onClick={closeMenu}><BrandLogo/></a>
        <button className="zf-mobile-toggle" type="button" aria-label={mobileMenuOpen ? "Fermer le menu" : "Ouvrir le menu"} aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>{mobileMenuOpen ? <X/> : <Menu/>}</button>
        <nav className={`zf-nav ${mobileMenuOpen ? "is-open" : ""}`} aria-label="Navigation principale">
          <button className="is-active" onClick={() => scrollTo("accueil")}>Accueil</button>
          <button onClick={() => scrollTo("fonctionnalites")}>Fonctionnalités</button>
          <button onClick={() => scrollTo("tarifs")}>Tarifs</button>
          <button onClick={() => scrollTo("apropos")}>À propos</button>
          <button onClick={() => scrollTo("ressources")}>Ressources <ChevronRight size={13}/></button>
          <span className="zf-language">FR <ChevronRight size={12}/></span>
          <div className="zf-mobile-actions"><button className="zf-button zf-button-quiet" onClick={() => { closeMenu(); onLogin(); }}>Se connecter</button><button className="zf-button zf-button-primary" onClick={() => { closeMenu(); onCreateAccount(); }}>Créer un compte</button></div>
        </nav>
        <div className="zf-header-actions"><button className="zf-button zf-button-quiet" onClick={onLogin}>Se connecter</button><button className="zf-button zf-button-primary" onClick={onCreateAccount}>Créer un compte</button></div>
      </header>

      <section className="zf-hero" id="accueil">
        <div className="zf-hero-copy">
          <span className="zf-hero-pill">UNE SOLUTION FINANCIÈRE COMPLÈTE</span>
          <h1>Facturation, paiements et comptabilité pour les <em>entreprises modernes</em></h1>
          <p>ZENOX Finance rassemble progressivement les outils essentiels à la gestion financière de votre organisation dans une plateforme sécurisée, conçue pour les entreprises de transport, de logistique, de commerce et de services.</p>
          <div className="zf-hero-actions"><button className="zf-button zf-button-primary zf-button-large" onClick={onCreateAccount}>Créer un compte gratuit <ArrowRight size={17}/></button><button className="zf-button zf-button-glass zf-button-large" onClick={() => scrollTo("fonctionnalites")}>Découvrir la plateforme <ChevronRight size={17}/></button></div>
          <div className="zf-trust-line"><span><CheckCircle2/> Parcours d’inscription sécurisé</span><span><CheckCircle2/> Architecture multi-tenant</span><span><CheckCircle2/> Évolution modulaire</span></div>
        </div>
        <div className="zf-hero-visual" aria-label="Aperçu illustratif de l’espace financier">
          <div className="zf-hero-world"><span className="zf-world-grid"/></div>
          <div className="zf-hero-shipping"><div className="zf-container-stack"><i/><i/><i/><i/><i/><i/></div><Truck size={74}/><div className="zf-shipping-label">FLUX COMMERCIAUX & FINANCIERS</div></div>
          <div className="zf-device">
            <div className="zf-device-top"><BrandLogo variant="compact"/><span>ESPACE FINANCIER</span><i/></div>
            <div className="zf-device-heading"><div><small>VUE D’ENSEMBLE</small><strong>Tableau de bord</strong></div><span>APERÇU</span></div>
            <div className="zf-device-stats"><div><small>Factures</small><b>—</b><i>Suivi centralisé</i></div><div><small>Paiements</small><b>—</b><i>Rapprochement</i></div><div><small>Clients</small><b>—</b><i>Référentiel</i></div></div>
            <div className="zf-device-chart"><div><b>Activité financière</b><small>APERÇU</small></div><div className="zf-bars">{[30,48,38,68,55,82,60,91,72,77,50,86].map((h,i)=><i key={i} style={{height:h+"%"}}/>)}</div></div>
            <div className="zf-device-foot"><ShieldCheck size={12}/> Vos données restent dans votre espace sécurisé.</div>
          </div>
          <div className="zf-phone"><div className="zf-phone-speaker"/><BrandLogo variant="compact"/><small>Mes factures</small><b>Votre espace mobile</b><span/><span/><span/></div>
          <div className="zf-hero-glow"/>
        </div>
      </section>

      <section className="zf-benefits" aria-label="Les points forts de ZENOX Finance">
        <article><span className="blue"><FileText/></span><div><b>Facturation professionnelle</b><p>Structurez vos documents commerciaux.</p></div></article>
        <article><span className="green"><Headphones/></span><div><b>Paiements organisés</b><p>Préparez le suivi des encaissements.</p></div></article>
        <article><span className="violet"><BarChart3/></span><div><b>Vision financière</b><p>Retrouvez les informations clés.</p></div></article>
        <article><span className="orange"><Cloud/></span><div><b>Accessible partout</b><p>Un espace web adapté à vos équipes.</p></div></article>
      </section>

      <section className="zf-about" id="apropos">
        <div className="zf-about-copy"><span className="zf-eyebrow">POURQUOI ZENOX FINANCE ?</span><h2>Une solution adaptée à vos besoins</h2><p>Que vous soyez une entreprise de transport, de logistique, de commerce ou de services, ZENOX Finance vise à simplifier la gestion financière, à réduire les erreurs et à vous aider à piloter votre activité.</p><button className="zf-button zf-button-primary" onClick={() => scrollTo("fonctionnalites")}>Découvrir les fonctionnalités <ArrowRight size={16}/></button></div>
        <div className="zf-sector-grid"><article className="zf-sector sector-transport"><Truck/><b>Transport & Logistique</b></article><article className="zf-sector sector-trade"><Globe2/><b>Commerce international</b></article><article className="zf-sector sector-stock"><Boxes/><b>Distribution & Stock</b></article><article className="zf-sector sector-business"><Building2/><b>Tous les secteurs</b></article></div>
      </section>

      <section className="zf-feature-area" id="fonctionnalites">
        <div className="zf-section-intro"><span className="zf-eyebrow">FONCTIONNALITÉS</span><h2>Tout ce dont vous avez besoin pour gérer votre activité financière</h2><p>Une plateforme modulaire : les capacités sont activées et connectées au fur et à mesure de leur validation.</p></div>
        {featureGroups.map((group) => <section className={`zf-feature-group tone-${group.tone}`} key={group.id} id={group.id}>
          <div className="zf-feature-group-heading"><span className="zf-feature-group-icon">{group.id === "facturation" ? <FileText/> : group.id === "paiements" ? <WalletCards/> : group.id === "comptabilite" ? <BarChart3/> : <PieChart/>}</span><div><h3>{group.title}</h3><p>{group.intro}</p></div></div>
          <div className="zf-feature-grid">{group.items.map(({icon:Icon,title,desc})=><article className="zf-feature-card" key={title}><span><Icon/></span><div><b>{title}</b><p>{desc}</p></div></article>)}</div>
        </section>)}
        <section className="zf-feature-group tone-slate" id="integrations">
          <div className="zf-feature-group-heading"><span className="zf-feature-group-icon"><Link2/></span><div><h3>Intégrations</h3><p>Préparez les connexions entre ZENOX Finance et vos outils métiers.</p></div></div>
          <div className="zf-integration-grid"><article><Webhook/><b>API</b><small>Pour vos développements personnalisés</small></article><article><Link2/><b>Intégrations futures</b><small>CRM, ERP, outils de transport</small></article><article><Smartphone/><b>Webhooks</b><small>Notifications et échanges événementiels</small></article><article><FileText/><b>Import / Export</b><small>Échanges de données structurés</small></article></div>
        </section>
      </section>

      <section className="zf-tarifs" id="tarifs"><div><span className="zf-eyebrow">TARIFS</span><h2>Une offre qui évolue avec votre activité</h2><p>Les formules et leurs périmètres seront publiés lorsque les capacités commerciales seront finalisées.</p></div><button className="zf-button zf-button-outline" onClick={onCreateAccount}>Créer votre espace <ArrowRight size={16}/></button></section>
      <section className="zf-resources" id="ressources"><div><span className="zf-eyebrow">RESSOURCES</span><h2>Un environnement conçu pour durer</h2><p>Une architecture indépendante, des responsabilités métier séparées et des interfaces sécurisées pour accompagner la croissance de votre organisation.</p></div><div className="zf-resource-points"><span><ShieldCheck/> Sécurité par conception</span><span><Users/> Gestion des accès</span><span><Globe2/> Contexte international</span></div></section>
      <section className="zf-cta"><div><h2>Prêt à simplifier votre gestion financière ?</h2><p>Créez votre compte et préparez l’espace de votre organisation.</p></div><button className="zf-button zf-button-primary zf-button-large" onClick={onCreateAccount}>Créer un compte gratuit <ArrowRight size={17}/></button></section>
      <footer className="zf-footer"><a href="#accueil" aria-label="ZENOX Finance, accueil"><BrandLogo/></a><span>© 2026 ZENOX Finance</span><span>Plateforme financière indépendante · API-first</span><button onClick={onLogin}>Se connecter</button></footer>
    </main>
  );
}
