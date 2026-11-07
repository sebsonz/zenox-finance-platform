import { useCallback, useEffect, useState, type FormEvent } from "react";
import { InvoiceTypeFields } from "../modules/billing/freight/invoices/types/InvoiceTypeFields.js";
import { InvoiceLinesEditor } from "../modules/billing/freight/invoices/components/InvoiceLinesEditor.js";
import { IssuedInvoiceDocumentsPanel } from "../modules/billing/freight/invoices/credit-notes/IssuedInvoiceDocumentsPanel.js";
import { InvoiceTaxContextPanel } from "../modules/billing/freight/invoices/tax/InvoiceTaxContextPanel.js";
import { InvoiceListPanel } from "../modules/billing/freight/invoices/list/InvoiceListPanel.js";
import { useInvoiceResources } from "../modules/billing/freight/invoices/hooks/useInvoiceResources.js";
import { useInvoiceDraft } from "../modules/billing/freight/invoices/hooks/useInvoiceDraft.js";
import { useInvoiceLifecycle } from "../modules/billing/freight/invoices/hooks/useInvoiceLifecycle.js";
import { useCreditNotes } from "../modules/billing/freight/invoices/hooks/useCreditNotes.js";
import type { DraftForm, InvoiceDraftRecord } from "../modules/billing/freight/invoices/types/invoice-draft.js";
import type { Customer, Currency, Jurisdiction } from "../modules/billing/freight/invoices/types/workspace-resources.js";
import { FileText, RefreshCw, ShieldCheck } from "lucide-react";

type ApiError = { error?: { code?: string; message?: string } };
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
type ApiPayload<T> = { data?: T } & ApiError;
async function responseError(response: Response, fallback: string): Promise<string> {
  try { const payload = await response.json() as ApiError; return payload.error?.message ?? fallback; }
  catch { return fallback; }
}
async function readData<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) throw new Error(await responseError(response, fallback));
  const payload = await response.json() as ApiPayload<T>;
  if (!payload.data) throw new Error(fallback);
  return payload.data;
}
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = filename; link.click();
  URL.revokeObjectURL(url);
}

export function InvoiceWorkspace({ sessionUser, activeTenant, tenants, onTenantChange }: InvoiceWorkspaceProps) {
  const tenantId = activeTenant.id;

  const [taxDate, setTaxDate] = useState(new Date().toISOString().slice(0, 10));
  const [appliesTo, setAppliesTo] = useState("GOODS");
  const [taxFacts, setTaxFacts] = useState<TaxFactsForm>(emptyTaxFacts);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [invoiceStatus, setInvoiceStatus] = useState("");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const {
    creditNotes, creditReason, setCreditReason, creditAmount, setCreditAmount,
    creditNoteReason, setCreditNoteReason, creditNoteAmount, setCreditNoteAmount,
    resetCreditNotes, loadCreditNotes, createCreditNote, issueCreditNote,
    downloadCreditNote, openCreditNoteDocument,
  } = useCreditNotes({ tenantId, setSelectedInvoiceId, setBusy, setNotice });

  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
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
  const { customers, currencies, jurisdictions, jurisdictionId, setJurisdictionId, checkingResources } = useInvoiceResources<Invoice>({
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
    form, setForm, editing, setEditing, resetDraft, startEdit, updateLine, addLine, removeLine,
  } = useInvoiceDraft({ customers, currencies, setSelectedInvoiceId, setNotice });
  useEffect(() => { setEditing(null); }, [tenantId, setEditing]);
  const { calculateTax, issueInvoice } = useInvoiceLifecycle({
    tenantId, jurisdictionId, taxDate, appliesTo, taxFacts, setBusy, setNotice, loadInvoices,
  });

  async function loadInvoices(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault(); if (!tenantId) { setNotice("Aucune organisation active n’est disponible."); return; }
    setLoading(true); setNotice("");
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (invoiceSearch.trim()) params.set("search", invoiceSearch.trim());
      if (invoiceStatus) params.set("status", invoiceStatus);
      const data = await readData<{ invoices?: Invoice[] }>(await fetch(`/api/v1/user/tenants/${tenantId}/invoices?${params.toString()}`, { credentials: "same-origin", cache: "no-store" }), "Impossible de charger les factures.");
      setInvoices(data.invoices ?? []);
      setSelectedInvoiceId((current) => (data.invoices ?? []).some((item) => item.id === current) ? current : "");
      setNotice(`${data.invoices?.length ?? 0} facture(s) chargée(s).`);
    } catch (error) { setInvoices([]); setNotice(error instanceof Error ? error.message : "Impossible de charger les factures."); }
    finally { setLoading(false); }
  }

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
    if (!tenantId || !form.customerId || !form.currencyCode || form.lines.some((line) => !line.description.trim())) {
      setNotice("Renseignez le client, la devise et la description de chaque ligne."); return;
    }
    setBusy(true); setNotice("");
    const payload = {
      documentType: form.documentType,
      ...(form.documentType === "DEPOSIT" ? { contractTotal: form.contractTotal } : {}),
      ...(form.documentType === "BALANCE" ? { relatedInvoiceId: form.relatedInvoiceId } : {}),
      customerId: form.customerId, currencyCode: form.currencyCode,
      ...(form.dueDate ? { dueDate: form.dueDate } : {}),
      ...(form.purchaseOrderReference.trim() ? { purchaseOrderReference: form.purchaseOrderReference.trim() } : {}),
      ...(form.serviceDate ? { serviceDate: form.serviceDate } : {}),
      ...(form.paymentTerms.trim() ? { paymentTerms: form.paymentTerms.trim() } : {}),
      ...(form.paymentInstructions.trim() ? { paymentInstructions: form.paymentInstructions.trim() } : {}),
      ...(form.externalReference.trim() ? { externalReference: form.externalReference.trim() } : {}),
      ...(form.footerNote.trim() ? { footerNote: form.footerNote.trim() } : {}),
      ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
      lines: form.lines.map((line) => ({ ...line, description: line.description.trim() })),
      ...(editing ? { expectedUpdatedAt: editing.updatedAt } : {}),
    };
    try {
      const response = await fetch(editing
        ? `/api/v1/user/tenants/${tenantId}/invoices/drafts/${editing.id}`
        : `/api/v1/user/tenants/${tenantId}/invoices/drafts`, {
        method: editing ? "PUT" : "POST", credentials: "same-origin",
        headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
      });
      const data = await readData<{ invoice: Invoice }>(response, "Impossible d’enregistrer le brouillon.");
      const savedInvoice = data.invoice;
      const successMessage = editing ? "Brouillon mis à jour." : "Brouillon créé.";

      // Reflect the successful write immediately. The list refresh below is
      // only reconciliation and can never undo or mask a successful save.
      setInvoices((current) => [savedInvoice, ...current.filter((item) => item.id !== savedInvoice.id)]);
      setEditing(savedInvoice);
      setSelectedInvoiceId(savedInvoice.id);
      setNotice(successMessage);

      try {
        const refreshed = await fetch(`/api/v1/user/tenants/${tenantId}/invoices?limit=100`, { credentials: "same-origin", cache: "no-store" });
        const refreshedData = await readData<{ invoices?: Invoice[] }>(refreshed, "Impossible d’actualiser les factures.");
        const refreshedInvoices = refreshedData.invoices ?? [];
        const reconciledInvoice = refreshedInvoices.find((item) => item.id === savedInvoice.id) ?? savedInvoice;
        setInvoices([reconciledInvoice, ...refreshedInvoices.filter((item) => item.id !== savedInvoice.id)]);
        setEditing(reconciledInvoice);
      } catch {
        // Keep the server-confirmed invoice visible and retain the success notice.
      }
    } catch (error) { setNotice(error instanceof Error ? error.message : "Erreur d’enregistrement."); }
    finally { setBusy(false); }
  }

  function openIssuedDocument(invoice: Invoice) {
    if (invoice.status !== "ISSUED") {
      setNotice("Seules les factures émises disposent d’un document définitif consultable.");
      return;
    }
    // Open synchronously from the user's click so the browser does not block
    // the authenticated same-origin document response as an async popup.
    window.open(
      `/api/v1/user/tenants/${tenantId}/invoices/${invoice.id}/document`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  async function downloadDocument(invoice: Invoice, format: "document" | "document.pdf") {
    setBusy(true);
    try {
      const response = await fetch(`/api/v1/user/tenants/${tenantId}/invoices/${invoice.id}/${format}`, { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error(await responseError(response, "Téléchargement impossible."));
      downloadBlob(await response.blob(), `${invoice.invoiceCode ?? "facture"}.${format.endsWith(".pdf") ? "pdf" : "html"}`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Téléchargement impossible."); }
    finally { setBusy(false); }
  }

  const selectedInvoice = invoices.find((invoice) => invoice.id === selectedInvoiceId) ?? editing;
  const creditedTotal = creditNotes.reduce((sum, note) => sum + Number(note.grandTotal || 0), 0);
  const remainingCredit = Math.max(0, Number(selectedInvoice?.grandTotal ?? 0) - creditedTotal);
  const currentRole = activeTenant.role;
  const canIssue = ["OWNER", "ADMIN", "FINANCE_MANAGER"].includes(currentRole);
  const canManageTax = canIssue;
  const canCredit = canIssue;
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
      <form className="tenant-lookup-form" onSubmit={(event) => void loadInvoices(event)}>
        <label>Organisation active<select value={activeTenant.id} onChange={(event) => onTenantChange(event.target.value)} disabled={tenants.length <= 1}>
          {tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.legalName} · {tenant.tenantCode} · {tenant.role}</option>)}
        </select></label>
        <button className="primary-button" type="submit" disabled={loading || checkingResources}>{loading ? "Chargement…" : "Actualiser"} <RefreshCw size={15}/></button>
      </form>
    </section>

        <section className="panel invoice-list-panel">
          <div className="panel-heading"><div><h2>{editing ? "Modifier le brouillon" : form.documentType === "CREDIT_NOTE" ? "Créer une facture d’avoir" : "Créer une facture"}</h2><p>{form.documentType === "CREDIT_NOTE" ? "Émission d’un avoir rattaché à une facture déjà émise. Le montant restant est contrôlé côté serveur." : "Le serveur calcule tous les montants. Une modification invalide le snapshot fiscal précédent."}</p></div><div className="invoice-editor-heading-actions">{editing && <button className="outline-button" type="button" onClick={resetDraft}>Annuler la modification</button>}<button className="primary-button" type="submit" form="invoice-draft-form" disabled={busy || (form.documentType === "CREDIT_NOTE" ? !form.relatedInvoiceId || !canCredit : checkingResources || customers.length === 0 || currencies.length === 0)}>{busy ? "Traitement…" : form.documentType === "CREDIT_NOTE" ? "Émettre l’avoir" : "Enregistrer la facture"} <FileText size={15}/></button></div></div>
          <form id="invoice-draft-form" className="invoice-editor" onSubmit={(event) => void saveDraft(event)}>
            <div className="invoice-form-grid">
              <label>Type de facture<select value={form.documentType} onChange={(event) => setForm({ ...form, documentType: event.target.value as DraftForm["documentType"], contractTotal: "", relatedInvoiceId: "" })}>
                <option value="STANDARD">Facture standard</option><option value="DEPOSIT">Facture d’acompte</option><option value="BALANCE">Facture de solde</option><option value="CREDIT_NOTE">Facture d’avoir</option>
              </select></label>
              <InvoiceTypeFields
                documentType={form.documentType}
                contractTotal={form.contractTotal}
                relatedInvoiceId={form.relatedInvoiceId}
                customerId={form.customerId}
                currencyCode={form.currencyCode}
                dueDate={form.dueDate}
                serviceDate={form.serviceDate}
                purchaseOrderReference={form.purchaseOrderReference}
                externalReference={form.externalReference}
                paymentTerms={form.paymentTerms}
                paymentInstructions={form.paymentInstructions}
                footerNote={form.footerNote}
                notes={form.notes}
                creditNoteReason={creditNoteReason}
                creditNoteAmount={creditNoteAmount}
                invoices={invoices}
                customers={customers}
                currencies={currencies}
                onContractTotalChange={(value) => setForm({ ...form, contractTotal: value })}
                onRelatedInvoiceChange={(source, id) => setForm({ ...form, relatedInvoiceId: id, customerId: source?.customerId ?? form.customerId, currencyCode: source?.currencyCode ?? form.currencyCode })}
                onCustomerChange={(value) => setForm({ ...form, customerId: value })}
                onCurrencyChange={(value) => setForm({ ...form, currencyCode: value })}
                onFieldChange={(field, value) => setForm({ ...form, [field]: value })}
                onCreditReasonChange={setCreditNoteReason}
                onCreditAmountChange={setCreditNoteAmount}
              />
            </div>
            <InvoiceLinesEditor
              documentType={form.documentType}
              lines={form.lines}
              onAdd={addLine}
              onUpdate={updateLine}
              onRemove={removeLine}
            />

            <div className="invoice-editor-submit-row"><button className="primary-button" type="submit" disabled={busy || (form.documentType === "CREDIT_NOTE" ? !form.relatedInvoiceId || !canCredit : checkingResources || customers.length === 0 || currencies.length === 0)}>{busy ? "Traitement…" : form.documentType === "CREDIT_NOTE" ? "Émettre la facture d’avoir" : editing ? "Enregistrer les modifications" : "Enregistrer la facture"} <FileText size={15}/></button></div>
            {form.documentType !== "CREDIT_NOTE" && customers.length === 0 && <p className="muted-note">Aucun client actif : ajoutez d’abord un client via le module Clients.</p>}
          </form>
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
    {notice && <div className="notice invoice-notice" role="status"><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Fermer">×</button></div>}
  </section>;
}
