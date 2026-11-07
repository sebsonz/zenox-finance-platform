export type InvoiceTaxFacts = {
  transactionType: string; supplierIfuStatus: string; customerIfuStatus: string; customerTaxStatus: string;
  customerCountryCode: string; supplierCountryCode: string; isImport: string; isExport: string; goodsCategory: string;
};
export type InvoiceTaxJurisdiction = { id: string; code: string; countryCode: string; name: string };
type Props = {
  jurisdictionId: string; jurisdictions: InvoiceTaxJurisdiction[]; taxDate: string; appliesTo: string;
  selectedInvoiceLabel: string; taxFacts: InvoiceTaxFacts;
  onJurisdictionChange: (value: string) => void; onTaxDateChange: (value: string) => void;
  onAppliesToChange: (value: string) => void; onTaxFactsChange: (facts: InvoiceTaxFacts) => void;
};
export function InvoiceTaxContextPanel(props: Props) {
  const update = <K extends keyof InvoiceTaxFacts>(key: K, value: InvoiceTaxFacts[K]) => props.onTaxFactsChange({ ...props.taxFacts, [key]: value });
  return <section className="panel invoice-list-panel">
    <div className="panel-heading"><div><h2>Fiscalité et émission</h2><p>Les règles actives doivent être vérifiées pour la juridiction et la date choisies.</p></div></div>
    <div className="invoice-form-grid">
      <label>Juridiction fiscale<select value={props.jurisdictionId} onChange={(event) => props.onJurisdictionChange(event.target.value)}><option value="">Choisir une juridiction</option>{props.jurisdictions.map((item) => <option key={item.id} value={item.id}>{item.countryCode} · {item.name} ({item.code})</option>)}</select></label>
      <label>Date fiscale<input type="date" value={props.taxDate} onChange={(event) => props.onTaxDateChange(event.target.value)} required/></label>
      <label>Nature de l’opération<select value={props.appliesTo} onChange={(event) => props.onAppliesToChange(event.target.value)}><option value="GOODS">Biens</option><option value="SERVICES">Services</option><option value="DIGITAL_SERVICES">Services numériques</option><option value="FREIGHT">Transport / fret</option><option value="INSURANCE">Assurance</option></select></label>
      <label>Facture sélectionnée<input readOnly value={props.selectedInvoiceLabel}/></label>
    </div>
    <details className="tax-facts-details"><summary>Contexte fiscal de l’opération <span className="muted-note">Informations utilisées pour sélectionner les règles applicables</span></summary>
      <div className="invoice-form-grid">
        <label>Type de transaction<input value={props.taxFacts.transactionType} onChange={(event) => update("transactionType", event.target.value)} placeholder="VENTE, PRESTATION…"/></label>
        <label>Statut IFU fournisseur<select value={props.taxFacts.supplierIfuStatus} onChange={(event) => update("supplierIfuStatus", event.target.value)}><option value="">Non renseigné</option><option value="REGISTERED">Immatriculé</option><option value="NOT_REGISTERED">Non immatriculé</option><option value="UNKNOWN">Inconnu</option></select></label>
        <label>Statut IFU client<select value={props.taxFacts.customerIfuStatus} onChange={(event) => update("customerIfuStatus", event.target.value)}><option value="">Non renseigné</option><option value="REGISTERED">Immatriculé</option><option value="NOT_REGISTERED">Non immatriculé</option><option value="UNKNOWN">Inconnu</option></select></label>
        <label>Statut fiscal client<input value={props.taxFacts.customerTaxStatus} onChange={(event) => update("customerTaxStatus", event.target.value)} placeholder="Statut fiscal documenté"/></label>
        <label>Pays du fournisseur (ISO)<input maxLength={2} value={props.taxFacts.supplierCountryCode} onChange={(event) => update("supplierCountryCode", event.target.value.toUpperCase())} placeholder="BJ"/></label>
        <label>Pays du client (ISO)<input maxLength={2} value={props.taxFacts.customerCountryCode} onChange={(event) => update("customerCountryCode", event.target.value.toUpperCase())} placeholder="BJ"/></label>
        <label>Importation<select value={props.taxFacts.isImport} onChange={(event) => update("isImport", event.target.value)}><option value="">Non renseigné</option><option value="true">Oui</option><option value="false">Non</option></select></label>
        <label>Exportation<select value={props.taxFacts.isExport} onChange={(event) => update("isExport", event.target.value)}><option value="">Non renseigné</option><option value="true">Oui</option><option value="false">Non</option></select></label>
        <label>Catégorie de biens<input value={props.taxFacts.goodsCategory} onChange={(event) => update("goodsCategory", event.target.value)} placeholder="Catégorie documentée"/></label>
      </div>
    </details>
    <p className="muted-note">L’émission exige un snapshot fiscal immuable. Après émission, la facture et ses documents ne peuvent plus être modifiés.</p>
  </section>;
}
