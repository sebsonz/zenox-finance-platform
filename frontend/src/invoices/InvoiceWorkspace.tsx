import { useCallback, useEffect, useState, useRef, type FormEvent } from "react";
import { InvoiceTypeFields } from "../modules/billing/freight/invoices/types/InvoiceTypeFields.js";
import { InvoiceLinesEditor } from "../modules/billing/freight/invoices/components/InvoiceLinesEditor.js";
import { IssuedInvoiceDocumentsPanel } from "../modules/billing/freight/invoices/credit-notes/IssuedInvoiceDocumentsPanel.js";
import { InvoiceTaxContextPanel } from "../modules/billing/freight/invoices/tax/InvoiceTaxContextPanel.js";
import { InvoiceListPanel } from "../modules/billing/freight/invoices/list/InvoiceListPanel.js";
import { useInvoiceResources } from "../modules/billing/freight/invoices/hooks/useInvoiceResources.js";
import { useInvoiceDraft } from "../modules/billing/freight/invoices/hooks/useInvoiceDraft.js";
import { useInvoiceDraftPersistence } from "../modules/billing/freight/invoices/hooks/useInvoiceDraftPersistence.js";
import { useInvoiceLifecycle } from "../modules/billing/freight/invoices/hooks/useInvoiceLifecycle.js";
import { useCreditNotes } from "../modules/billing/freight/invoices/hooks/useCreditNotes.js";
import { useInvoiceDocuments } from "../modules/billing/freight/invoices/hooks/useInvoiceDocuments.js";
import { useInvoiceList } from "../modules/billing/freight/invoices/hooks/useInvoiceList.js";
import type { DraftForm, InvoiceDraftRecord } from "../modules/billing/freight/invoices/types/invoice-draft.js";
import type { Customer, Currency } from "../modules/billing/freight/invoices/types/workspace-resources.js";
import { FileText, RefreshCw, ShieldCheck, Eye, Send, X, Building2, UserRound, Search, Plus, StickyNote, SlidersHorizontal, Paperclip } from "lucide-react";

type Invoice = InvoiceDraftRecord;
type SessionUser = { id: string; email?: string };
type ActiveTenant = { id: string; tenantCode: string; legalName: string; role: string };
type InvoiceWorkspaceProps = { sessionUser: SessionUser; activeTenant: ActiveTenant; tenants: ActiveTenant[]; onTenantChange: (tenantId: string) => void };
type TaxFactsForm = {
  transactionType: string;
  supplierIfuStatus: string;
  customerIfuStatus: string;
  customerTaxStatus: string;
  customerCountryCode: string;
  supplierCountryCode: string;
  isImport: string;
  isExport: string;
  goodsCategory: string;
};
const emptyTaxFacts = (): TaxFactsForm => ({
  transactionType: "", supplierIfuStatus: "", customerIfuStatus: "", customerTaxStatus: "",
  customerCountryCode: "", supplierCountryCode: "", isImport: "", isExport: "", goodsCategory: "",
});
export function InvoiceWorkspace({ sessionUser, activeTenant, tenants, onTenantChange }: InvoiceWorkspaceProps) {
  const tenantId = activeTenant.id;

  const [taxDate, setTaxDate] = useState(new Date().toISOString().slice(0, 10));
  const [appliesTo, setAppliesTo] = useState("GOODS");
  const [taxFacts, setTaxFacts] = useState<TaxFactsForm>(emptyTaxFacts);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [invoiceStatus, setInvoiceStatus] = useState("");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [customerSaving, setCustomerSaving] = useState(false);
  const [customerDraft, setCustomerDraft] = useState({ customerCode: "", customerType: "BUSINESS" as "BUSINESS" | "INDIVIDUAL", legalName: "", displayName: "", email: "", phone: "", addressLine1: "", addressCity: "", countryCode: "BJ", taxIdentifier: "" });
  const [invoiceTab, setInvoiceTab] = useState<"NOTES" | "TERMS" | "ATTACHMENTS">("NOTES");
  const [customerSearch, setCustomerSearch] = useState("");
  const { loading, loadInvoices } = useInvoiceList({
    tenantId, search: invoiceSearch, status: invoiceStatus, setInvoices, setSelectedInvoiceId, setNotice,
  });
  const {
    creditNotes, creditReason, setCreditReason, creditAmount, setCreditAmount,
    creditNoteReason, setCreditNoteReason, creditNoteAmount, setCreditNoteAmount,
    resetCreditNotes, loadCreditNotes, createCreditNote, issueCreditNote,
    downloadCreditNote, openCreditNoteDocument,
  } = useCreditNotes({ tenantId, setSelectedInvoiceId, setBusy, setNotice });
  const onTenantReset = useCallback(() => {
    setSelectedInvoiceId("");
    resetCreditNotes();
    setTaxFacts(emptyTaxFacts());
  }, [resetCreditNotes]);
  const onCustomersLoaded = useCallback((loadedCustomers: Customer[]) => {
    setForm((current) => ({ ...current, customerId: current.customerId || loadedCustomers[0]?.id || "" }));
  }, []);
  const onCurrenciesLoaded = useCallback((loadedCurrencies: Currency[]) => {
    setForm((current) => ({
      ...current,
      currencyCode: loadedCurrencies.some((currency) => currency.code === current.currencyCode)
        ? current.currencyCode
        : (loadedCurrencies[0]?.code ?? "XOF"),
    }));
  }, []);
  const { customers, setCustomers, currencies, jurisdictions, jurisdictionId, setJurisdictionId, checkingResources } = useInvoiceResources<Invoice>({
    sessionUserId: sessionUser.id,
    tenantId,
    role: activeTenant.role,
    setInvoices,
    onTenantReset,
    setNotice,
    onCustomersLoaded,
    onCurrenciesLoaded,
  });
  const {
    form, setForm, editing, setEditing, resetDraft, startEdit, updateLine, addLine, removeLine, duplicateLine, reorderLines,
  } = useInvoiceDraft({ customers, currencies, setSelectedInvoiceId, setNotice });
  useEffect(() => { setEditing(null); }, [tenantId, setEditing]);
  const { saveStandardDraft } = useInvoiceDraftPersistence({
    tenantId, form, editing, setInvoices, setEditing, setSelectedInvoiceId, setBusy, setNotice,
  });
  const { openIssuedDocument, downloadDocument } = useInvoiceDocuments({ tenantId, setBusy, setNotice });
  const { calculateTax, issueInvoice } = useInvoiceLifecycle({
    tenantId, jurisdictionId, taxDate, appliesTo, taxFacts, setBusy, setNotice, loadInvoices, setEditing,
  });

  const autosaveSnapshotRef = useRef(JSON.stringify(form));
  const autosaveEditingIdRef = useRef<string | null>(editing?.id ?? null);
  useEffect(() => {
    const editingId = editing?.id ?? null;
    const snapshot = JSON.stringify(form);
    if (autosaveEditingIdRef.current !== editingId) {
      autosaveEditingIdRef.current = editingId;
      autosaveSnapshotRef.current = snapshot;
      return;
    }
    if (autosaveSnapshotRef.current === snapshot || form.documentType === "CREDIT_NOTE") return;
    autosaveSnapshotRef.current = snapshot;
    if (!form.customerId || !form.currencyCode || form.lines.some((line) => !line.description.trim())) return;
    if (form.documentType === "DEPOSIT" && !form.contractTotal.trim()) return;
    if (form.documentType === "BALANCE" && !form.relatedInvoiceId) return;
    const timeout = window.setTimeout(() => {
      void saveStandardDraft();
    }, 900);
    return () => window.clearTimeout(timeout);
  }, [form, editing?.id, saveStandardDraft]);

  async function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (form.documentType === "CREDIT_NOTE") {
      const source = invoices.find((item) => item.id === form.relatedInvoiceId && item.status === "ISSUED");
      if (!tenantId || !source || creditNoteReason.trim().length < 3) {
        setNotice("Sélectionnez une facture d’origine émise et renseignez le motif de l’avoir."); return;
      }
      if (creditNoteAmount.trim() && !/^(?:0|[1-9][0-9]{0,15})(?:[.][0-9]{1,8})?$/.test(creditNoteAmount.trim())) {
        setNotice("Le montant de l’avoir doit être un montant positif valide."); return;
      }
      setSelectedInvoiceId(source.id);
      await createCreditNote(source, creditNoteReason, creditNoteAmount);
      return;
    }
    await saveStandardDraft();
  }

  const selectedCustomer = customers.find((customer) => customer.id === form.customerId);
  async function createCustomerFromInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tenantId || customerSaving) return;
    setCustomerSaving(true);
    setNotice("");
    try {
      const response = await fetch(`/api/v1/user/tenants/${tenantId}/customers`, {
        method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...customerDraft,
          customerCode: customerDraft.customerCode.trim().toUpperCase(),
          legalName: customerDraft.legalName.trim(),
          ...(customerDraft.displayName.trim() ? { displayName: customerDraft.displayName.trim() } : {}),
          ...(customerDraft.email.trim() ? { email: customerDraft.email.trim() } : {}),
          ...(customerDraft.phone.trim() ? { phone: customerDraft.phone.trim() } : {}),
          ...(customerDraft.addressLine1.trim() ? { addressLine1: customerDraft.addressLine1.trim() } : {}),
          ...(customerDraft.addressCity.trim() ? { addressCity: customerDraft.addressCity.trim() } : {}),
          countryCode: customerDraft.countryCode.trim().toUpperCase(),
          ...(customerDraft.taxIdentifier.trim() ? { taxIdentifier: customerDraft.taxIdentifier.trim() } : {}),
          ...(form.currencyCode ? { defaultCurrency: form.currencyCode } : {}),
          metadata: {},
        }),
      });
      const payload = await response.json() as { data?: { customer?: Customer }; error?: { message?: string } };
      if (!response.ok || !payload.data?.customer) throw new Error(payload.error?.message ?? "Impossible de créer le client.");
      const created = payload.data.customer;
      setCustomers((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      setForm((current) => ({ ...current, customerId: created.id }));
      setCustomerModalOpen(false);
      setCustomerSearch("");
      setCustomerDraft({ customerCode: "", customerType: "BUSINESS", legalName: "", displayName: "", email: "", phone: "", addressLine1: "", addressCity: "", countryCode: "BJ", taxIdentifier: "" });
      setNotice("Client créé et sélectionné pour cette facture.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Impossible de créer le client.");
    } finally {
      setCustomerSaving(false);
    }
  }
  const selectedInvoice = invoices.find((invoice) => invoice.id === selectedInvoiceId) ?? editing;
  const creditedTotal = creditNotes.reduce((sum, note) => sum + Number(note.grandTotal || 0), 0);
  const remainingCredit = Math.max(0, Number(selectedInvoice?.grandTotal ?? 0) - creditedTotal);
  const currentRole = activeTenant.role;
  const canIssue = ["OWNER", "ADMIN", "FINANCE_MANAGER"].includes(currentRole);
  const canManageTax = canIssue;
  const canCredit = canIssue;
  const canManageCustomers = ["OWNER", "ADMIN", "FINANCE_MANAGER"].includes(currentRole);
  return <section className="invoice-workspace">
    <div className="invoice-heading">
      <div><div className="eyebrow"><FileText size={14}/> GESTION FINANCIÈRE</div><h1>Factures</h1><p className="subtitle">Brouillons, calcul fiscal, émission et documents immuables.</p></div>

    </div>
    <div className="demo-banner"><div className="demo-icon"><ShieldCheck size={19}/></div><div><strong>Opérations sécurisées côté serveur</strong><p>Chaque écriture vérifie la session, le tenant et les permissions. L’émission est idempotente et irréversible.</p></div><span className="demo-pill">BFF</span></div>

    <section className="panel invoice-list-panel">
      <div className="panel-heading">
        <div><h2>Espace de facturation</h2><p>Connecté{sessionUser.email ? ` en tant que ${sessionUser.email}` : ""} · Organisation : {activeTenant.legalName} ({activeTenant.tenantCode}) · {checkingResources ? "Chargement des référentiels…" : `${customers.length} client(s), ${currencies.length} devise(s)`}</p></div>
        <span className="status-chip"><i/> Session active · {activeTenant.role}</span>
      </div>
      <form className="tenant-lookup-form" onSubmit={(event) => { event.preventDefault(); void loadInvoices(); }}>
        <label>Organisation active<select value={activeTenant.id} onChange={(event) => onTenantChange(event.target.value)} disabled={tenants.length <= 1}>
          {tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.legalName} · {tenant.tenantCode} · {tenant.role}</option>)}
        </select></label>
        <button className="primary-button" type="submit" disabled={loading || checkingResources}>{loading ? "Chargement…" : "Actualiser"} <RefreshCw size={15}/></button>
      </form>
    </section>

        <section className="panel invoice-list-panel">
          <div className="panel-heading invoice-composer-heading"><div className="invoice-composer-title"><span className="invoice-composer-document-icon"><FileText size={22}/></span><div><h2>{editing ? "Modifier la facture" : form.documentType === "CREDIT_NOTE" ? "Nouvelle facture d’avoir" : "Nouvelle facture"}</h2><p><span className="invoice-draft-pill">{editing?.status === "ISSUED" ? "Émise" : "Brouillon"}</span><span>{editing?.invoiceCode ?? "Numéro attribué à l’émission"}</span></p></div><label className="invoice-type-picker"><span className="sr-only">Type de facture</span><select value={form.documentType} onChange={(event) => setForm({ ...form, documentType: event.target.value as DraftForm["documentType"], contractTotal: "", relatedInvoiceId: "" })}><option value="STANDARD">Facture standard</option><option value="DEPOSIT">Facture d’acompte</option><option value="BALANCE">Facture de solde</option><option value="CREDIT_NOTE">Facture d’avoir</option></select></label></div><div className="invoice-editor-heading-actions"><span className="invoice-editor-status"><RefreshCw size={13}/> Autosauvegarde · 900 ms</span>{editing && <button className="outline-button" type="button" onClick={() => { if (window.confirm("Quitter la modification de ce brouillon ? Les modifications non enregistrées seront perdues.")) resetDraft(); }}>Annuler</button>}<button className="outline-button" type="button" onClick={() => void saveStandardDraft()} disabled={busy || form.documentType === "CREDIT_NOTE"}><FileText size={14}/> Enregistrer</button><button className="outline-button" type="button" onClick={() => setPreviewOpen(true)}><Eye size={14}/> Prévisualiser</button><button className="primary-button" type="button" disabled={busy || !editing || editing.status !== "DRAFT" || form.documentType === "CREDIT_NOTE" || !canIssue} onClick={() => { if (!editing) return; if (editing.taxStatus !== "CALCULATED") { setNotice("Calcul fiscal en cours : vérifiez les paramètres fiscaux avant de relancer l’émission."); void calculateTax(editing); return; } void issueInvoice(editing); }}><Send size={14}/> Émettre la facture</button></div></div>
          <div className="invoice-editor-shell">
          <div className="invoice-editor-main">
          <form id="invoice-draft-form" className="invoice-editor" onSubmit={(event) => void saveDraft(event)}>
            <section className="invoice-editor-meta">
              <label>Numéro<input value={editing?.invoiceCode ?? "Attribué à l’émission"} readOnly aria-label="Numéro de facture"/></label>
              <label>Date d’émission<input type="date" value={taxDate} onChange={(event) => setTaxDate(event.target.value)} required/></label>
              <label>Date d’échéance<input type="date" value={form.dueDate} onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))}/></label>
              <label>Devise<select value={form.currencyCode} onChange={(event) => setForm((current) => ({ ...current, currencyCode: event.target.value }))} required>{currencies.map((currency) => <option key={currency.code} value={currency.code}>{currency.code} – {currency.name}</option>)}</select></label>
            </section>
            {form.documentType === "STANDARD" && <section className="invoice-parties-grid">
              <article className="invoice-party-card">
                <header><span className="invoice-party-icon"><Building2 size={19}/></span><div><h3>Émetteur</h3><small>Organisation facturante</small></div></header>
                <strong>{activeTenant.legalName}</strong>
                <p>Code organisation : {activeTenant.tenantCode}</p>
                <small className="invoice-party-note">Les coordonnées légales détaillées seront affichées dès qu’elles seront exposées par le profil organisation.</small>
              </article>
              <article className="invoice-party-card">
                <header><span className="invoice-party-icon"><UserRound size={19}/></span><div><h3>Client <em>*</em></h3><small>Destinataire de la facture</small></div></header>
                <div className="invoice-customer-select"><select value={form.customerId} onChange={(event) => setForm((current) => ({ ...current, customerId: event.target.value }))} required><option value="">Sélectionner un client…</option>{customers.filter((customer) => !customerSearch || customer.legalName.toLocaleLowerCase().includes(customerSearch.toLocaleLowerCase()) || (customer.displayName ?? "").toLocaleLowerCase().includes(customerSearch.toLocaleLowerCase()) || customer.customerCode.toLocaleLowerCase().includes(customerSearch.toLocaleLowerCase())).map((customer) => <option key={customer.id} value={customer.id}>{customer.displayName || customer.legalName} · {customer.customerCode}</option>)}</select><button type="button" className="small-action" aria-label="Rechercher un client" title="Filtrer la liste des clients" onClick={() => document.getElementById("invoice-customer-search")?.focus()}><Search size={16}/></button></div>
                <input id="invoice-customer-search" className="invoice-customer-search" placeholder="Rechercher par nom ou code client…" value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} aria-label="Rechercher un client"/>
                {selectedCustomer && <div className="invoice-selected-customer"><strong>{selectedCustomer.displayName || selectedCustomer.legalName}</strong><span>{selectedCustomer.email || "E-mail non renseigné"} · {selectedCustomer.phone || "Téléphone non renseigné"}</span><span>{selectedCustomer.addressLine1 || "Adresse non renseignée"}{selectedCustomer.addressCity ? `, ${selectedCustomer.addressCity}` : ""}</span>{selectedCustomer.taxIdentifier && <span>Identifiant fiscal : {selectedCustomer.taxIdentifier}</span>}</div>}
                <button type="button" className="invoice-create-customer" disabled={!canManageCustomers} title={!canManageCustomers ? "Votre rôle ne permet pas de créer un client." : undefined} onClick={() => setCustomerModalOpen(true)}><Plus size={15}/> Créer un nouveau client</button>
              </article>
            </section>}
            {form.documentType !== "STANDARD" && <div className="invoice-form-grid"><InvoiceTypeFields
              documentType={form.documentType} contractTotal={form.contractTotal} relatedInvoiceId={form.relatedInvoiceId}
              customerId={form.customerId} currencyCode={form.currencyCode} dueDate={form.dueDate} serviceDate={form.serviceDate}
              purchaseOrderReference={form.purchaseOrderReference} externalReference={form.externalReference}
              paymentTerms={form.paymentTerms} paymentInstructions={form.paymentInstructions} footerNote={form.footerNote} notes={form.notes}
              creditNoteReason={creditNoteReason} creditNoteAmount={creditNoteAmount} invoices={invoices} customers={customers} currencies={currencies}
              onContractTotalChange={(value) => setForm((current) => ({ ...current, contractTotal: value }))}
              onRelatedInvoiceChange={(source, id) => setForm((current) => ({ ...current, relatedInvoiceId: id, customerId: source?.customerId ?? current.customerId, currencyCode: source?.currencyCode ?? current.currencyCode }))}
              onCustomerChange={(value) => setForm((current) => ({ ...current, customerId: value }))}
              onCurrencyChange={(value) => setForm((current) => ({ ...current, currencyCode: value }))}
              onFieldChange={(field, value) => setForm((current) => ({ ...current, [field]: value }))}
              onCreditReasonChange={setCreditNoteReason} onCreditAmountChange={setCreditNoteAmount}
            /></div>}
            <InvoiceLinesEditor
              documentType={form.documentType}
              lines={form.lines}
              onAdd={addLine}
              onUpdate={updateLine}
              onRemove={removeLine}
              onDuplicate={duplicateLine}
              onReorder={reorderLines}
            />
            {form.documentType === "STANDARD" && <section className="invoice-editor-tabs">
              <nav className="invoice-editor-tabbar" aria-label="Informations complémentaires">
                <button type="button" className={invoiceTab === "NOTES" ? "active" : ""} onClick={() => setInvoiceTab("NOTES")}><StickyNote size={15}/> Notes</button>
                <button type="button" className={invoiceTab === "TERMS" ? "active" : ""} onClick={() => setInvoiceTab("TERMS")}><SlidersHorizontal size={15}/> Conditions</button>
                <button type="button" className={invoiceTab === "ATTACHMENTS" ? "active" : ""} onClick={() => { setInvoiceTab("ATTACHMENTS"); setNotice("Le module de pièces jointes n’est pas encore disponible dans l’API de facturation. Aucun fichier n’a été envoyé."); }}><Paperclip size={15}/> Pièces jointes (0)</button>
              </nav>
              {invoiceTab === "NOTES" && <div className="invoice-tab-panel"><label>Notes destinées au client<textarea value={form.notes} maxLength={5000} placeholder="Informations complémentaires visibles sur la facture…" onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}/></label><label>Note de bas de facture<textarea value={form.footerNote} maxLength={1000} placeholder="Mentions légales ou commerciales complémentaires…" onChange={(event) => setForm((current) => ({ ...current, footerNote: event.target.value }))}/></label></div>}
              {invoiceTab === "TERMS" && <div className="invoice-tab-panel invoice-terms-grid"><label>Conditions de paiement<input value={form.paymentTerms} maxLength={500} placeholder="Paiement à 30 jours, date de facture" onChange={(event) => setForm((current) => ({ ...current, paymentTerms: event.target.value }))}/></label><label>Mode et instructions de paiement<input value={form.paymentInstructions} maxLength={2000} placeholder="Virement bancaire, Mobile Money…" onChange={(event) => setForm((current) => ({ ...current, paymentInstructions: event.target.value }))}/></label><label>Référence commande<input value={form.purchaseOrderReference} maxLength={120} placeholder="BC-2026-0001" onChange={(event) => setForm((current) => ({ ...current, purchaseOrderReference: event.target.value }))}/></label><label>Référence externe<input value={form.externalReference} maxLength={120} placeholder="Référence client" onChange={(event) => setForm((current) => ({ ...current, externalReference: event.target.value }))}/></label><label>Date de prestation / livraison<input type="date" value={form.serviceDate} onChange={(event) => setForm((current) => ({ ...current, serviceDate: event.target.value }))}/></label></div>}
              {invoiceTab === "ATTACHMENTS" && <div className="invoice-attachments-unavailable"><Paperclip size={22}/><strong>Pièces jointes non activées</strong><p>Le stockage sécurisé et l’API de rattachement des fichiers doivent être implémentés avant de permettre un envoi ici.</p></div>}
            </section>}

            {form.documentType === "CREDIT_NOTE" && <div className="invoice-editor-submit-row"><button className="primary-button" type="submit" disabled={busy || (form.documentType === "CREDIT_NOTE" ? !form.relatedInvoiceId || !canCredit : checkingResources || customers.length === 0 || currencies.length === 0)}>{busy ? "Traitement…" : form.documentType === "CREDIT_NOTE" ? "Émettre la facture d’avoir" : editing ? "Enregistrer les modifications" : "Enregistrer la facture"} <FileText size={15}/></button></div>}
            {form.documentType !== "CREDIT_NOTE" && customers.length === 0 && <p className="muted-note">Aucun client actif : ajoutez d’abord un client via le module Clients.</p>}
          </form>
          </div>
          <aside className="invoice-summary-sidebar" aria-label="Synthèse de la facture">
            <section className="invoice-summary-card">
              <h3><span className="invoice-summary-icon">▤</span> Synthèse financière</h3>
              <div className="invoice-summary-row"><span>Sous-total HT</span><strong>{editing ? `${editing.subtotal} ${editing.currencyCode}` : "Calcul après enregistrement"}</strong></div>
              <div className="invoice-summary-row"><span>Taxes</span><strong>{editing ? `${editing.taxTotal} ${editing.currencyCode}` : "—"}</strong></div>
              <div className="invoice-summary-row total"><span>Total TTC</span><strong>{editing ? `${editing.grandTotal} ${editing.currencyCode}` : "—"}</strong></div>
              <p className="invoice-summary-hint">Les montants définitifs sont calculés et contrôlés par le moteur financier côté serveur.</p>
            </section>
            <section className="invoice-summary-card">
              <h3><span className="invoice-summary-icon">◷</span> Situation financière</h3>
              <div className="invoice-summary-row"><span>Montant dû</span><strong>{editing ? `${editing.amountDue} ${editing.currencyCode}` : "À déterminer"}</strong></div>
              <div className="invoice-summary-row"><span>État du document</span><strong>{editing?.status === "ISSUED" ? "Émise" : editing ? "Brouillon" : "Nouveau"}</strong></div>
              <p className="invoice-summary-hint">Les paiements et acomptes affichés proviennent des enregistrements financiers, jamais d'une saisie libre dans cette synthèse.</p>
            </section>
            <section className="invoice-summary-card">
              <h3><span className="invoice-summary-icon">▦</span> Conditions de règlement</h3>
              <div className="invoice-summary-row"><span>Échéance</span><strong>{form.dueDate || "Non définie"}</strong></div>
              <div className="invoice-summary-row"><span>Conditions</span><strong>{form.paymentTerms || "À définir"}</strong></div>
              <div className="invoice-summary-row"><span>Moyen / instructions</span><strong>{form.paymentInstructions || "Non défini"}</strong></div>
            </section>
          </aside>
        </div>
        </section>

        <InvoiceListPanel
          invoices={invoices}
          selectedInvoiceId={selectedInvoiceId}
          search={invoiceSearch}
          status={invoiceStatus}
          loading={loading}
          busy={busy}
          canManageTax={canManageTax}
          canIssue={canIssue}
          hasJurisdiction={Boolean(jurisdictionId)}
          onSearchChange={setInvoiceSearch}
          onStatusChange={setInvoiceStatus}
          onSubmit={() => void loadInvoices()}
          onEdit={(item) => { const invoice = invoices.find((candidate) => candidate.id === item.id); if (invoice) startEdit(invoice); }}
          onCalculateTax={(item) => { const invoice = invoices.find((candidate) => candidate.id === item.id); if (invoice) void calculateTax(invoice); }}
          onIssue={(item) => { const invoice = invoices.find((candidate) => candidate.id === item.id); if (invoice) void issueInvoice(invoice); }}
          onDownload={(item, format) => { const invoice = invoices.find((candidate) => candidate.id === item.id); if (invoice) void downloadDocument(invoice, format); }}
          onLoadCreditNotes={(item) => { const invoice = invoices.find((candidate) => candidate.id === item.id); if (invoice) void loadCreditNotes(invoice); }}
        />

        <InvoiceTaxContextPanel
          jurisdictionId={jurisdictionId}
          jurisdictions={jurisdictions}
          taxDate={taxDate}
          appliesTo={appliesTo}
          selectedInvoiceLabel={selectedInvoice?.invoiceCode ?? selectedInvoice?.id ?? "Sélectionnez une facture"}
          taxFacts={taxFacts}
          onJurisdictionChange={setJurisdictionId}
          onTaxDateChange={setTaxDate}
          onAppliesToChange={setAppliesTo}
          onTaxFactsChange={setTaxFacts}
        />

        <IssuedInvoiceDocumentsPanel
          invoice={selectedInvoice}
          creditNotes={creditNotes}
          creditReason={creditReason}
          creditAmount={creditAmount}
          remainingCredit={remainingCredit}
          busy={busy}
          canCredit={canCredit}
          onOpenInvoice={(item) => { const invoice = invoices.find((candidate) => candidate.id === item.id); if (invoice) openIssuedDocument(invoice); }}
          onDownloadInvoice={(item, format) => { const invoice = invoices.find((candidate) => candidate.id === item.id); if (invoice) void downloadDocument(invoice, format); }}
          onLoadCreditNotes={(item) => { const invoice = invoices.find((candidate) => candidate.id === item.id); if (invoice) void loadCreditNotes(invoice); }}
          onCreditReasonChange={setCreditReason}
          onCreditAmountChange={setCreditAmount}
          onIssueCreditNote={(item) => { const invoice = invoices.find((candidate) => candidate.id === item.id); if (invoice) void issueCreditNote(invoice); }}
          onOpenCreditNote={openCreditNoteDocument}
          onDownloadCreditNote={downloadCreditNote}
        />
    {customerModalOpen && <div className="invoice-preview-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !customerSaving) setCustomerModalOpen(false); }}><section className="invoice-customer-dialog" role="dialog" aria-modal="true" aria-labelledby="invoice-customer-dialog-title"><header><div><span className="eyebrow">RÉFÉRENTIEL CLIENTS</span><h2 id="invoice-customer-dialog-title">Créer un nouveau client</h2><p>Le client sera créé dans l’organisation active et sélectionné sur cette facture.</p></div><button type="button" className="small-action" onClick={() => setCustomerModalOpen(false)} disabled={customerSaving} aria-label="Fermer"><X size={18}/></button></header><form onSubmit={(event) => void createCustomerFromInvoice(event)}><div className="invoice-customer-form-grid"><label>Code client *<input required minLength={2} maxLength={60} pattern="[A-Za-z0-9][A-Za-z0-9_-]+" value={customerDraft.customerCode} placeholder="CLIENT_001" onChange={(event) => setCustomerDraft((current) => ({ ...current, customerCode: event.target.value.toUpperCase() }))}/></label><label>Type *<select value={customerDraft.customerType} onChange={(event) => setCustomerDraft((current) => ({ ...current, customerType: event.target.value as "BUSINESS" | "INDIVIDUAL" }))}><option value="BUSINESS">Entreprise</option><option value="INDIVIDUAL">Particulier</option></select></label><label className="wide">Raison sociale / Nom complet *<input required maxLength={200} value={customerDraft.legalName} onChange={(event) => setCustomerDraft((current) => ({ ...current, legalName: event.target.value }))}/></label><label>Nom commercial<input maxLength={200} value={customerDraft.displayName} onChange={(event) => setCustomerDraft((current) => ({ ...current, displayName: event.target.value }))}/></label><label>E-mail<input type="email" maxLength={254} value={customerDraft.email} onChange={(event) => setCustomerDraft((current) => ({ ...current, email: event.target.value }))}/></label><label>Téléphone<input maxLength={40} value={customerDraft.phone} onChange={(event) => setCustomerDraft((current) => ({ ...current, phone: event.target.value }))}/></label><label>Adresse<input maxLength={200} value={customerDraft.addressLine1} onChange={(event) => setCustomerDraft((current) => ({ ...current, addressLine1: event.target.value }))}/></label><label>Ville<input maxLength={120} value={customerDraft.addressCity} onChange={(event) => setCustomerDraft((current) => ({ ...current, addressCity: event.target.value }))}/></label><label>Pays (code ISO-2) *<input required minLength={2} maxLength={2} pattern="[A-Za-z]{2}" value={customerDraft.countryCode} onChange={(event) => setCustomerDraft((current) => ({ ...current, countryCode: event.target.value.toUpperCase() }))}/></label><label className="wide">Identifiant fiscal<input maxLength={100} value={customerDraft.taxIdentifier} onChange={(event) => setCustomerDraft((current) => ({ ...current, taxIdentifier: event.target.value }))}/></label></div><footer><button type="button" className="outline-button" onClick={() => setCustomerModalOpen(false)} disabled={customerSaving}>Annuler</button><button type="submit" className="primary-button" disabled={customerSaving}>{customerSaving ? "Création…" : "Créer et sélectionner"} <Plus size={15}/></button></footer></form></section></div>}
    {previewOpen && <div className="invoice-preview-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreviewOpen(false); }}><section className="invoice-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="invoice-preview-title"><header><div><span className="eyebrow">APERÇU DU DOCUMENT</span><h2 id="invoice-preview-title">{form.documentType === "CREDIT_NOTE" ? "Avoir" : "Facture"} · {editing?.invoiceCode ?? "Brouillon non numéroté"}</h2></div><button type="button" className="small-action" onClick={() => setPreviewOpen(false)} aria-label="Fermer l’aperçu"><X size={18}/></button></header><div className="invoice-preview-paper"><div className="invoice-preview-paper-head"><div><strong>{activeTenant.legalName}</strong><small>Organisation {activeTenant.tenantCode}</small></div><div><strong>{form.documentType === "CREDIT_NOTE" ? "AVOIR" : "FACTURE"}</strong><small>{new Date().toLocaleDateString("fr-FR")}</small></div></div><div className="invoice-preview-client"><small>CLIENT</small><strong>{customers.find((customer) => customer.id === form.customerId)?.displayName || customers.find((customer) => customer.id === form.customerId)?.legalName || "Client à sélectionner"}</strong></div><table><thead><tr><th>Désignation</th><th>Qté</th><th>Prix unitaire HT</th><th>Remise</th><th>TVA</th></tr></thead><tbody>{form.lines.map((line, index) => <tr key={line.id ?? index}><td>{line.description || "Ligne sans désignation"}</td><td>{line.quantity}</td><td>{line.unitPrice} {form.currencyCode}</td><td>{line.discountPercent}%</td><td>{line.taxRatePercent}%</td></tr>)}</tbody></table><div className="invoice-preview-total"><small>Montants définitifs calculés par le serveur</small>{editing && <strong>{editing.grandTotal} {editing.currencyCode}</strong>}</div><div className="invoice-preview-terms"><strong>Conditions de règlement</strong><p>{form.paymentTerms || "Non renseignées"}</p><p>{form.paymentInstructions || "Modalités de paiement non renseignées"}</p>{form.notes && <><strong>Notes</strong><p>{form.notes}</p></>}</div></div><footer><span>Prévisualisation de travail · non contractuelle avant émission</span><button type="button" className="primary-button" onClick={() => setPreviewOpen(false)}>Fermer</button></footer></section></div>}
    {notice && <div className="notice invoice-notice" role="status"><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Fermer">×</button></div>}
  </section>;
}
