import {
  Activity, ArrowUpRight, Globe2, ShieldCheck, SlidersHorizontal
} from "lucide-react";

export function TaxWorkspace({ amount, setAmount, currency, setCurrency, onSubmit }: { amount: string; setAmount: (v: string) => void; currency: string; setCurrency: (v: string) => void; onSubmit: () => void }) {
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
