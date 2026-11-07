import { useEffect, useState, type FormEvent } from "react";
import { FileText, RefreshCw, ShieldCheck, Plus, Trash2, Download, Pencil, Send, ReceiptText } from "lucide-react";

type ApiError = { error?: { code?: string; message?: string } };
type SessionUser = { id: string; email?: string };
type ActiveTenant = { id: string; tenantCode: string; legalName: string; role: string };
type InvoiceWorkspaceProps = { sessionUser: SessionUser; activeTenant: ActiveTenant; tenants: ActiveTenant[]; onTenantChange: (tenantId: string) => void };
type Customer = { id: string; customerCode: string; legalName: string; displayName: string | null; status: "ACTIVE" | "ARCHIVED"; defaultCurrency: string | null };
type Currency = { code: string; name: string; minorUnit: number };
type Jurisdiction = { id: string; code: string; countryCode: string; name: string; level: string };
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
type InvoiceLine = { id?: string; lineType: "ITEM"|"SERVICE"|"FEE"|"EXPENSE"; description: string; itemCode: string; unit: string; lineNote: string; quantity: string; unitPrice: string; discountPercent: string; taxRatePercent: string };
type InvoiceDocumentForm = { title: string; invoiceKind: "STANDARD"|"ADVANCE"|"BALANCE"; sourceReference: string; reference: string; purchaseOrderNumber: string; contractReference: string; paymentTerms: string; paymentMethod: string; deliveryDate: string; servicePeriodStart: string; servicePeriodEnd: string; footer: string; language: string; globalDiscountPercent: string; globalDiscountAmount: string };
type Invoice = {
  id: string; customerId: string; invoiceCode: string | null; status: "DRAFT" | "ISSUED" | "CANCELLED";
  currencyCode: string; currencyMinorUnit: number; grandTotal: string; amountDue: string; subtotal: string;
  taxTotal: string; createdAt: string; updatedAt: string; dueDate: string | null; notes: string | null;
  documentVersion: number; taxSnapshotId: string | null; taxStatus: "PROVISIONAL" | "CALCULATED" | "REVIEW_REQUIRED";
  customerSnapshot?: { legalName?: string; displayName?: string };
  document?: Partial<InvoiceDocumentForm>;
  lines: Array<{ id: string; description: string; lineType?: "ITEM"|"SERVICE"|"FEE"|"EXPENSE"; itemCode?: string | null; unit?: string | null; lineNote?: string | null; quantity: string; unitPrice: string; discountPercent: string; taxRatePercent: string; total: string }>;
};
type CreditNote = { id: string; originalInvoiceId: string; creditNoteCode: string; status: "ISSUED"; reason: string; currencyCode: string; grandTotal: string; amountDue: string; issuedAt: string };
type InvoiceAdjustment = { id:string; adjustment_code:string; adjustment_type:"CREDIT_NOTE"|"DEBIT_NOTE"; reason:string; currency_code:string; grand_total:string; amount_due:string; issued_at:string };
type InvoiceRelationship = {id:string;relationship_type:string;source_reference:string|null;applied_amount:string;source_invoice_id:string;related_invoice_id:string;advance_invoice_code:string|null;related_invoice_code:string|null};
type DraftForm = { customerId: string; currencyCode: string; dueDate: string; notes: string; document: InvoiceDocumentForm; lines: InvoiceLine[] };
type ApiPayload<T> = { data?: T } & ApiError;
const emptyLine = (): InvoiceLine => ({ lineType: "ITEM", description: "", itemCode: "", unit: "unité", lineNote: "", quantity: "1", unitPrice: "0", discountPercent: "0", taxRatePercent: "0" });
const emptyDocument = (): InvoiceDocumentForm => ({ title: "FACTURE", invoiceKind: "STANDARD", sourceReference: "", reference: "", purchaseOrderNumber: "", contractReference: "", paymentTerms: "", paymentMethod: "", deliveryDate: "", servicePeriodStart: "", servicePeriodEnd: "", footer: "", language: "fr", globalDiscountPercent: "0", globalDiscountAmount: "0" });
const emptyForm = (): DraftForm => ({ customerId: "", currencyCode: "XOF", dueDate: "", notes: "", document: emptyDocument(), lines: [emptyLine()] });

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
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [jurisdictions, setJurisdictions] = useState<Jurisdiction[]>([]);
  const [jurisdictionId, setJurisdictionId] = useState("");
  const [taxDate, setTaxDate] = useState(new Date().toISOString().slice(0, 10));
  const [appliesTo, setAppliesTo] = useState("GOODS");
  const [taxFacts, setTaxFacts] = useState<TaxFactsForm>(emptyTaxFacts);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [creditNotes, setCreditNotes] = useState<CreditNote[]>([]);
  const [adjustments, setAdjustments] = useState<InvoiceAdjustment[]>([]);
  const [relationships, setRelationships] = useState<InvoiceRelationship[]>([]);
  const [advanceInvoiceId, setAdvanceInvoiceId] = useState("");
  const [advanceAppliedAmount, setAdvanceAppliedAmount] = useState("");
  const [advanceReference, setAdvanceReference] = useState("");
  const [adjustmentType, setAdjustmentType] = useState<"CREDIT_NOTE"|"DEBIT_NOTE">("CREDIT_NOTE");
  const [adjustmentReason, setAdjustmentReason] = useState("Correction partielle de la facture");
  const [adjustmentQuantities, setAdjustmentQuantities] = useState<Record<string,string>>({});
  const [creditReason, setCreditReason] = useState("Annulation de la facture d’origine");
  const [form, setForm] = useState<DraftForm>(emptyForm());
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [checkingResources, setCheckingResources] = useState(false);

  useEffect(() => {
    if (!sessionUser.id || !tenantId) return;
    setInvoices([]);
    setSelectedInvoiceId("");
    setCreditNotes([]);
    setAdjustments([]);
    setRelationships([]);
    setEditing(null);
    setTaxFacts(emptyTaxFacts());
    let cancelled = false;
    async function loadResources() {
      setCheckingResources(true);
      try {
        const role = activeTenant.role;
        const canCreateInvoices = ["OWNER", "ADMIN", "FINANCE_MANAGER", "FINANCE_OPERATOR"].includes(role);
        const [customerData, currencyData, jurisdictionData] = await Promise.all([
          canCreateInvoices
            ? readData<{ customers?: Customer[] }>(await fetch(`/api/v1/user/tenants/${tenantId}/customers?status=ACTIVE&limit=100`, { credentials: "same-origin", cache: "no-store" }), "Impossible de charger les clients.")
            : Promise.resolve({ customers: [] as Customer[] }),
          canCreateInvoices
            ? readData<{ currencies?: Currency[] }>(await fetch(`/api/v1/user/tenants/${tenantId}/currencies`, { credentials: "same-origin", cache: "no-store" }), "Impossible de charger les devises.")
            : Promise.resolve({ currencies: [] as Currency[] }),
          readData<{ jurisdictions?: Jurisdiction[] }>(await fetch(`/api/v1/user/tenants/${tenantId}/tax-jurisdictions`, { credentials: "same-origin", cache: "no-store" }), "Impossible de charger les juridictions fiscales."),
        ]);
        if (cancelled) return;
        setCustomers(customerData.customers ?? []);
        setCurrencies(currencyData.currencies ?? []);
        setJurisdictions(jurisdictionData.jurisdictions ?? []);
        setForm((current) => ({
          ...current,
          customerId: current.customerId || customerData.customers?.[0]?.id || "",
          currencyCode: currencyData.currencies?.some((currency) => currency.code === current.currencyCode)
            ? current.currencyCode : (currencyData.currencies?.[0]?.code ?? "XOF"),
        }));
        setJurisdictionId((current) => jurisdictionData.jurisdictions?.some((item) => item.id === current)
          ? current : (jurisdictionData.jurisdictions?.[0]?.id ?? ""));
      } catch (error) { if (!cancelled) setNotice(error instanceof Error ? error.message : "Impossible de charger les données de facturation."); }
      finally { if (!cancelled) setCheckingResources(false); }
    }
    void loadResources();
    return () => { cancelled = true; };
  }, [sessionUser.id, tenantId, activeTenant.role]);

  async function loadInvoices(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault(); if (!tenantId) { setNotice("Aucune organisation active n’est disponible."); return; }
    setLoading(true); setNotice("");
    try {
      const data = await readData<{ invoices?: Invoice[] }>(await fetch(`/api/v1/user/tenants/${tenantId}/invoices?limit=100`, { credentials: "same-origin", cache: "no-store" }), "Impossible de charger les factures.");
      setInvoices(data.invoices ?? []);
      setSelectedInvoiceId((current) => (data.invoices ?? []).some((item) => item.id === current) ? current : "");
      setNotice(`${data.invoices?.length ?? 0} facture(s) chargée(s).`);
    } catch (error) { setInvoices([]); setNotice(error instanceof Error ? error.message : "Impossible de charger les factures."); }
    finally { setLoading(false); }
  }

  function resetDraft() {
    setEditing(null);
    setForm({ ...emptyForm(), customerId: customers[0]?.id ?? "", currencyCode: currencies[0]?.code ?? "XOF" });
  }
  function startEdit(invoice: Invoice) {
    if (invoice.status !== "DRAFT") { setNotice("Seuls les brouillons peuvent être modifiés."); return; }
    setEditing(invoice);
    setForm({
      customerId: invoice.customerId, currencyCode: invoice.currencyCode, dueDate: invoice.dueDate ?? "", notes: invoice.notes ?? "",
      document: { ...emptyDocument(), ...(invoice.document ?? {}) },
      lines: invoice.lines.map((line) => ({ lineType: line.lineType ?? "ITEM", description: line.description, itemCode: line.itemCode ?? "", unit: line.unit ?? "unité", lineNote: line.lineNote ?? "", quantity: line.quantity, unitPrice: line.unitPrice, discountPercent: line.discountPercent, taxRatePercent: line.taxRatePercent })),
    });
    setSelectedInvoiceId(invoice.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function updateLine(index: number, field: keyof InvoiceLine, value: string) {
    setForm((current) => ({ ...current, lines: current.lines.map((line, i) => i === index ? { ...line, [field]: value } : line) }));
  }

  async function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tenantId || !form.customerId || !form.currencyCode || form.lines.some((line) => !line.description.trim())) {
      setNotice("Renseignez le client, la devise et la description de chaque ligne."); return;
    }
    setBusy(true); setNotice("");
    const payload = {
      customerId: form.customerId, currencyCode: form.currencyCode,
      ...(form.dueDate ? { dueDate: form.dueDate } : {}),
      ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
      document: Object.fromEntries(Object.entries(form.document).filter(([, value]) => value.trim() !== "")),
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
      const successMessage = editing ? "Brouillon mis à jour." : "Brouillon créé.";
      setEditing(data.invoice); setSelectedInvoiceId(data.invoice.id);
      const refreshed = await fetch(`/api/v1/user/tenants/${tenantId}/invoices?limit=100`, { credentials: "same-origin", cache: "no-store" });
      const refreshedData = await readData<{ invoices?: Invoice[] }>(refreshed, "Impossible d’actualiser les factures.");
      setInvoices(refreshedData.invoices ?? []);
      const saved = (refreshedData.invoices ?? []).find((item) => item.id === data.invoice.id) ?? data.invoice;
      setEditing(saved);
      setNotice(successMessage);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Erreur d’enregistrement."); }
    finally { setBusy(false); }
  }

  async function calculateTax(invoice: Invoice) {
    if (!jurisdictionId) { setNotice("Aucune juridiction fiscale active n’est disponible."); return; }
    setBusy(true); setNotice("");
    try {
      const response = await fetch(`/api/v1/user/tenants/${tenantId}/invoices/${invoice.id}/tax-snapshot`, {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedUpdatedAt: invoice.updatedAt, taxDate, jurisdictionId, appliesTo,
          taxFacts: {
            ...(taxFacts.transactionType.trim() ? { transactionType: taxFacts.transactionType.trim() } : {}),
            ...(taxFacts.supplierIfuStatus ? { supplierIfuStatus: taxFacts.supplierIfuStatus } : {}),
            ...(taxFacts.customerIfuStatus ? { customerIfuStatus: taxFacts.customerIfuStatus } : {}),
            ...(taxFacts.customerTaxStatus.trim() ? { customerTaxStatus: taxFacts.customerTaxStatus.trim() } : {}),
            ...(taxFacts.customerCountryCode.trim() ? { customerCountryCode: taxFacts.customerCountryCode.trim().toUpperCase() } : {}),
            ...(taxFacts.supplierCountryCode.trim() ? { supplierCountryCode: taxFacts.supplierCountryCode.trim().toUpperCase() } : {}),
            ...(taxFacts.isImport ? { isImport: taxFacts.isImport === "true" } : {}),
            ...(taxFacts.isExport ? { isExport: taxFacts.isExport === "true" } : {}),
            ...(taxFacts.goodsCategory.trim() ? { goodsCategory: taxFacts.goodsCategory.trim() } : {}),
          },
        }),
      });
      await readData(response, "Le calcul fiscal a échoué.");
      setNotice("Snapshot fiscal calculé et attaché. Le brouillon peut être émis.");
      await loadInvoices();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Le calcul fiscal a échoué."); }
    finally { setBusy(false); }
  }

  async function issueInvoice(invoice: Invoice) {
    if (!window.confirm(`Émettre définitivement la facture ${invoice.invoiceCode ?? "brouillon"} ? Cette opération est irréversible.`)) return;
    setBusy(true); setNotice("");
    try {
      const response = await fetch(`/api/v1/user/tenants/${tenantId}/invoices/${invoice.id}/issue`, {
        method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json", "Idempotency-Key": `issue-${invoice.id}-v${invoice.documentVersion}` },
        body: JSON.stringify({ expectedUpdatedAt: invoice.updatedAt }),
      });
      await readData(response, "L’émission de la facture a échoué.");
      setNotice("Facture émise. Les documents HTML et PDF immuables sont disponibles.");
      await loadInvoices();
    } catch (error) { setNotice(error instanceof Error ? error.message : "L’émission a échoué."); }
    finally { setBusy(false); }
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

  async function loadCreditNotes(invoice: Invoice) {
    setSelectedInvoiceId(invoice.id);
    try {
      const data = await readData<{ creditNotes?: CreditNote[] }>(await fetch(`/api/v1/user/tenants/${tenantId}/invoices/${invoice.id}/credit-notes`, { credentials: "same-origin", cache: "no-store" }), "Impossible de charger les avoirs.");
      setCreditNotes(data.creditNotes ?? []);
    } catch (error) { setCreditNotes([]); setNotice(error instanceof Error ? error.message : "Impossible de charger les avoirs."); }
  }

  async function loadInvoiceRelationships(invoice:Invoice) {
    setSelectedInvoiceId(invoice.id);
    try {
      const data=await readData<{relationships?:InvoiceRelationship[]}>(await fetch("/api/v1/user/tenants/"+tenantId+"/invoices/"+invoice.id+"/relationships",{credentials:"same-origin",cache:"no-store"}),"Impossible de charger les liens d’acomptes.");
      setRelationships(data.relationships??[]);
    } catch(error){setRelationships([]);setNotice(error instanceof Error?error.message:"Impossible de charger les liens d’acomptes.");}
  }
  async function applyAdvance(invoice:Invoice) {
    if(!advanceInvoiceId||!advanceAppliedAmount){setNotice("Sélectionnez une facture d’acompte et un montant.");return;}
    setBusy(true);
    try {
      await readData(await fetch("/api/v1/user/tenants/"+tenantId+"/invoices/"+invoice.id+"/relationships",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({advanceInvoiceId,relationshipType:"BALANCE_OF",appliedAmount:advanceAppliedAmount,sourceReference:advanceReference||undefined})}),"L’acompte n’a pas pu être appliqué.");
      setNotice("Acompte lié à la facture de solde.");
      setAdvanceAppliedAmount("");setAdvanceReference("");
      await loadInvoiceRelationships(invoice);
    } catch(error){setNotice(error instanceof Error?error.message:"Application de l’acompte impossible.");}
    finally{setBusy(false);}
  }
  async function loadAdjustments(invoice: Invoice) {
    setSelectedInvoiceId(invoice.id);
    try {
      const data = await readData<{adjustments?:InvoiceAdjustment[]}>(await fetch("/api/v1/user/tenants/"+tenantId+"/invoices/"+invoice.id+"/adjustments",{credentials:"same-origin",cache:"no-store"}),"Impossible de charger les corrections.");
      setAdjustments(data.adjustments??[]);
      setAdjustmentQuantities(Object.fromEntries(invoice.lines.map(line=>[line.id,line.quantity])));
    } catch(error) { setAdjustments([]); setNotice(error instanceof Error?error.message:"Impossible de charger les corrections."); }
  }
  async function issueAdjustment(invoice:Invoice) {
    const lines=invoice.lines.filter(line=>Number(adjustmentQuantities[line.id]??"0")>0).map(line=>({sourceInvoiceLineId:line.id,quantity:adjustmentQuantities[line.id]??"0"}));
    if(!lines.length||adjustmentReason.trim().length<3){setNotice("Sélectionnez au moins une ligne et renseignez un motif.");return;}
    const label=adjustmentType==="CREDIT_NOTE"?"note de crédit":"note de débit";
    if(!window.confirm("Confirmer l’émission irréversible de cette "+label+" ?"))return;
    setBusy(true);
    try {
      await readData(await fetch("/api/v1/user/tenants/"+tenantId+"/invoices/"+invoice.id+"/adjustments",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({type:adjustmentType,reason:adjustmentReason,lines})}),"La correction n’a pas pu être émise.");
      setNotice(adjustmentType==="CREDIT_NOTE"?"Avoir partiel émis.":"Note de débit émise.");
      await loadAdjustments(invoice);
    } catch(error){setNotice(error instanceof Error?error.message:"Émission impossible.");}
    finally{setBusy(false);}
  }
  async function downloadAdjustment(adjustment:InvoiceAdjustment) {
    setBusy(true);
    try{const response=await fetch("/api/v1/user/tenants/"+tenantId+"/invoice-adjustments/"+adjustment.id+"/document",{credentials:"same-origin",cache:"no-store"});if(!response.ok)throw new Error(await responseError(response,"Téléchargement impossible."));downloadBlob(await response.blob(),adjustment.adjustment_code+".html");}
    catch(error){setNotice(error instanceof Error?error.message:"Téléchargement impossible.");}
    finally{setBusy(false);}
  }
  async function issueCreditNote(invoice: Invoice) {
    if (!window.confirm("Créer un avoir intégral irréversible pour cette facture ?")) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/v1/user/tenants/${tenantId}/invoices/${invoice.id}/credit-notes`, {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: creditReason }),
      });
      await readData(response, "La création de l’avoir a échoué.");
      setNotice("Avoir intégral créé.");
      await loadCreditNotes(invoice);
    } catch (error) { setNotice(error instanceof Error ? error.message : "La création de l’avoir a échoué."); }
    finally { setBusy(false); }
  }
  async function downloadCreditNote(id: string, format: "document" | "document.pdf", code: string) {
    setBusy(true);
    try {
      const response = await fetch(`/api/v1/user/tenants/${tenantId}/invoices/credit-notes/${id}/${format}`, { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error(await responseError(response, "Téléchargement impossible."));
      downloadBlob(await response.blob(), `${code}.${format.endsWith(".pdf") ? "pdf" : "html"}`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Téléchargement impossible."); }
    finally { setBusy(false); }
  }

  const selectedInvoice = invoices.find((invoice) => invoice.id === selectedInvoiceId) ?? editing;
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
          <div className="panel-heading"><div><h2>{editing ? "Modifier le brouillon" : "Créer une facture"}</h2><p>Le serveur calcule tous les montants. Une modification invalide le snapshot fiscal précédent.</p></div><div className="invoice-editor-heading-actions">{editing && <button className="outline-button" type="button" onClick={resetDraft}>Annuler la modification</button>}<button className="primary-button" type="submit" form="invoice-draft-form" disabled={busy || checkingResources || customers.length === 0 || currencies.length === 0}>{busy ? "Enregistrement…" : "Enregistrer la facture"} <FileText size={15}/></button></div></div>
          <form id="invoice-draft-form" className="invoice-editor" onSubmit={(event) => void saveDraft(event)}>
            <div className="invoice-form-grid">
              <label>Client<select value={form.customerId} onChange={(event) => setForm({ ...form, customerId: event.target.value })} required>
                <option value="">Choisir un client actif</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.displayName || customer.legalName} · {customer.customerCode}</option>)}
              </select></label>
              <label>Devise<select value={form.currencyCode} onChange={(event) => setForm({ ...form, currencyCode: event.target.value })} required>
                {currencies.map((currency) => <option key={currency.code} value={currency.code}>{currency.code} · {currency.name}</option>)}
              </select></label>
              <label>Date d’échéance<input type="date" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })}/></label>
              <label>Notes<input value={form.notes} maxLength={5000} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Notes visibles sur la facture"/></label>
            </div>
            <details className="tax-facts-details" open>
              <summary>Informations commerciales et conditions de facturation</summary>
              <div className="invoice-form-grid">
                <label>Type de facture<select value={form.document.invoiceKind} onChange={(event) => setForm({ ...form, document: { ...form.document, invoiceKind: event.target.value as InvoiceDocumentForm["invoiceKind"] } })}><option value="STANDARD">Facture standard</option><option value="ADVANCE">Facture d’acompte</option><option value="BALANCE">Facture de solde</option></select></label>
                <label>Référence commande / contrat source<input value={form.document.sourceReference} maxLength={160} onChange={(event) => setForm({ ...form, document: { ...form.document, sourceReference: event.target.value } })}/></label>
                <label>Titre du document<input value={form.document.title} maxLength={120} onChange={(event) => setForm({ ...form, document: { ...form.document, title: event.target.value } })}/></label>
                <label>Référence interne<input value={form.document.reference} maxLength={120} onChange={(event) => setForm({ ...form, document: { ...form.document, reference: event.target.value } })} placeholder="REF-2026-001"/></label>
                <label>Bon de commande<input value={form.document.purchaseOrderNumber} maxLength={120} onChange={(event) => setForm({ ...form, document: { ...form.document, purchaseOrderNumber: event.target.value } })}/></label>
                <label>Référence contrat<input value={form.document.contractReference} maxLength={120} onChange={(event) => setForm({ ...form, document: { ...form.document, contractReference: event.target.value } })}/></label>
                <label>Date de livraison<input type="date" value={form.document.deliveryDate} onChange={(event) => setForm({ ...form, document: { ...form.document, deliveryDate: event.target.value } })}/></label>
                <label>Début de prestation<input type="date" value={form.document.servicePeriodStart} onChange={(event) => setForm({ ...form, document: { ...form.document, servicePeriodStart: event.target.value } })}/></label>
                <label>Fin de prestation<input type="date" value={form.document.servicePeriodEnd} onChange={(event) => setForm({ ...form, document: { ...form.document, servicePeriodEnd: event.target.value } })}/></label>
                <label>Moyen de paiement<input value={form.document.paymentMethod} maxLength={120} onChange={(event) => setForm({ ...form, document: { ...form.document, paymentMethod: event.target.value } })} placeholder="Virement, Mobile Money…"/></label>
                <label className="line-description">Conditions de règlement<textarea value={form.document.paymentTerms} maxLength={2000} onChange={(event) => setForm({ ...form, document: { ...form.document, paymentTerms: event.target.value } })} rows={2}/></label>
                <label className="line-description">Pied de page<input value={form.document.footer} maxLength={2000} onChange={(event) => setForm({ ...form, document: { ...form.document, footer: event.target.value } })} placeholder="Coordonnées bancaires et mentions commerciales"/></label>
                <label>Remise globale (%)<input inputMode="decimal" value={form.document.globalDiscountPercent} onChange={(event) => setForm({ ...form, document: { ...form.document, globalDiscountPercent: event.target.value, globalDiscountAmount: "0" } })}/></label>
                <label>Remise globale (montant)<input inputMode="decimal" value={form.document.globalDiscountAmount} onChange={(event) => setForm({ ...form, document: { ...form.document, globalDiscountAmount: event.target.value, globalDiscountPercent: "0" } })}/></label>
                <label>Langue du document<input value={form.document.language} maxLength={12} onChange={(event) => setForm({ ...form, document: { ...form.document, language: event.target.value } })}/></label>
              </div>
            </details>
            <div className="invoice-lines-heading"><h3>Lignes de facture</h3><button className="outline-button" type="button" onClick={() => setForm({ ...form, lines: [...form.lines, emptyLine()] })} disabled={form.lines.length >= 500}><Plus size={14}/> Ajouter une ligne</button></div>
            {form.lines.map((line, index) => <div className="invoice-line-editor" key={index}>
              <label>Nature<select value={line.lineType} onChange={(event) => updateLine(index, "lineType", event.target.value)}><option value="ITEM">Article</option><option value="SERVICE">Prestation</option><option value="FEE">Frais</option><option value="EXPENSE">Débours</option></select></label>
              <label className="line-description">Description<input value={line.description} maxLength={500} onChange={(event) => updateLine(index, "description", event.target.value)} required/></label>
              <label>Réf. article<input value={line.itemCode} maxLength={100} onChange={(event) => updateLine(index, "itemCode", event.target.value)}/></label>
              <label>Unité<input value={line.unit} maxLength={40} onChange={(event) => updateLine(index, "unit", event.target.value)}/></label>
              <label>Qté<input inputMode="decimal" value={line.quantity} onChange={(event) => updateLine(index, "quantity", event.target.value)} required/></label>
              <label>Prix unitaire<input inputMode="decimal" value={line.unitPrice} onChange={(event) => updateLine(index, "unitPrice", event.target.value)} required/></label>
              <label>Remise %<input inputMode="decimal" value={line.discountPercent} onChange={(event) => updateLine(index, "discountPercent", event.target.value)} required/></label>
              <label>Taxe provisoire %<input inputMode="decimal" value={line.taxRatePercent} onChange={(event) => updateLine(index, "taxRatePercent", event.target.value)} required/></label>
              <label className="line-description">Détail complémentaire<input value={line.lineNote} maxLength={1000} onChange={(event) => updateLine(index, "lineNote", event.target.value)}/></label>
              <button className="icon-danger" type="button" title="Supprimer la ligne" disabled={form.lines.length === 1} onClick={() => setForm({ ...form, lines: form.lines.filter((_, i) => i !== index) })}><Trash2 size={15}/></button>
            </div>)}
            <div className="invoice-editor-submit-row"><button className="primary-button" type="submit" disabled={busy || checkingResources || customers.length === 0 || currencies.length === 0}>{busy ? "Enregistrement…" : editing ? "Enregistrer les modifications" : "Enregistrer la facture"} <FileText size={15}/></button></div>
            {customers.length === 0 && <p className="muted-note">Aucun client actif : ajoutez d’abord un client via le module Clients.</p>}
          </form>
        </section>

        <section className="panel invoice-list-panel">
          <div className="panel-heading"><div><h2>Factures de l’organisation</h2><p>{invoices.length} facture(s) chargée(s). Choisissez une ligne pour voir les actions disponibles.</p></div></div>
          <div className="table-scroll"><table className="invoice-table"><thead><tr><th>Référence</th><th>Client</th><th>Statut</th><th>Taxe</th><th>Devise</th><th>Total</th><th>Actions</th></tr></thead>
            <tbody>{invoices.length ? invoices.map((invoice) => <tr key={invoice.id} className={selectedInvoiceId === invoice.id ? "selected-invoice-row" : ""}>
              <td><strong>{invoice.invoiceCode ?? "Brouillon"}</strong><small>{invoice.id.slice(0, 8)}…</small></td><td>{invoice.customerSnapshot?.displayName ?? invoice.customerSnapshot?.legalName ?? "—"}</td>
              <td><span className={`invoice-status ${invoice.status.toLowerCase()}`}>{invoice.status}</span></td><td>{invoice.taxStatus === "CALCULATED" ? "Calculée" : invoice.taxStatus === "REVIEW_REQUIRED" ? "À revoir" : "Provisoire"}</td>
              <td>{invoice.currencyCode}</td><td>{invoice.grandTotal}</td><td><div className="invoice-actions">
                {invoice.status === "DRAFT" && <button title="Modifier" className="small-action" onClick={() => startEdit(invoice)}><Pencil size={14}/></button>}
                {invoice.status === "DRAFT" && <button title="Calculer la taxe" className="small-action" disabled={busy || !jurisdictionId || !canManageTax || invoice.taxStatus === "CALCULATED"} onClick={() => void calculateTax(invoice)}><ShieldCheck size={14}/></button>}
                {invoice.status === "DRAFT" && invoice.taxStatus === "CALCULATED" && <button title="Émettre" className="small-action" disabled={busy || !canIssue} onClick={() => void issueInvoice(invoice)}><Send size={14}/></button>}
                {invoice.status === "ISSUED" && <button title="Télécharger PDF" className="small-action" disabled={busy} onClick={() => void downloadDocument(invoice, "document.pdf")}><Download size={14}/></button>}
                {invoice.status === "ISSUED" && <button title="Historique des avoirs" className="small-action" onClick={() => void loadCreditNotes(invoice)}><ReceiptText size={14}/></button>}
              </div></td></tr>) : <tr><td colSpan={7} className="invoice-empty">{loading ? "Chargement…" : "Aucune facture chargée. Cliquez sur Actualiser."}</td></tr>}</tbody>
          </table></div>
        </section>

        <section className="panel invoice-list-panel">
          <div className="panel-heading"><div><h2>Fiscalité et émission</h2><p>Les règles actives doivent être vérifiées pour la juridiction et la date choisies.</p></div></div>
          <div className="invoice-form-grid">
            <label>Juridiction fiscale<select value={jurisdictionId} onChange={(event) => setJurisdictionId(event.target.value)}><option value="">Choisir une juridiction</option>{jurisdictions.map((item) => <option key={item.id} value={item.id}>{item.countryCode} · {item.name} ({item.code})</option>)}</select></label>
            <label>Date fiscale<input type="date" value={taxDate} onChange={(event) => setTaxDate(event.target.value)} required/></label>
            <label>Nature de l’opération<select value={appliesTo} onChange={(event) => setAppliesTo(event.target.value)}><option value="GOODS">Biens</option><option value="SERVICES">Services</option><option value="DIGITAL_SERVICES">Services numériques</option><option value="FREIGHT">Transport / fret</option><option value="INSURANCE">Assurance</option></select></label>
            <label>Facture sélectionnée<input readOnly value={selectedInvoice?.invoiceCode ?? selectedInvoice?.id ?? "Sélectionnez une facture"} /></label>
          </div>
          <details className="tax-facts-details">
            <summary>Contexte fiscal de l’opération <span className="muted-note">Informations utilisées pour sélectionner les règles applicables</span></summary>
            <div className="invoice-form-grid">
              <label>Type de transaction<input value={taxFacts.transactionType} onChange={(event) => setTaxFacts({ ...taxFacts, transactionType: event.target.value })} placeholder="VENTE, PRESTATION…"/></label>
              <label>Statut IFU fournisseur<select value={taxFacts.supplierIfuStatus} onChange={(event) => setTaxFacts({ ...taxFacts, supplierIfuStatus: event.target.value })}><option value="">Non renseigné</option><option value="REGISTERED">Immatriculé</option><option value="NOT_REGISTERED">Non immatriculé</option><option value="UNKNOWN">Inconnu</option></select></label>
              <label>Statut IFU client<select value={taxFacts.customerIfuStatus} onChange={(event) => setTaxFacts({ ...taxFacts, customerIfuStatus: event.target.value })}><option value="">Non renseigné</option><option value="REGISTERED">Immatriculé</option><option value="NOT_REGISTERED">Non immatriculé</option><option value="UNKNOWN">Inconnu</option></select></label>
              <label>Statut fiscal client<input value={taxFacts.customerTaxStatus} onChange={(event) => setTaxFacts({ ...taxFacts, customerTaxStatus: event.target.value })} placeholder="Statut fiscal documenté"/></label>
              <label>Pays du fournisseur (ISO)<input maxLength={2} value={taxFacts.supplierCountryCode} onChange={(event) => setTaxFacts({ ...taxFacts, supplierCountryCode: event.target.value.toUpperCase() })} placeholder="BJ"/></label>
              <label>Pays du client (ISO)<input maxLength={2} value={taxFacts.customerCountryCode} onChange={(event) => setTaxFacts({ ...taxFacts, customerCountryCode: event.target.value.toUpperCase() })} placeholder="BJ"/></label>
              <label>Importation<select value={taxFacts.isImport} onChange={(event) => setTaxFacts({ ...taxFacts, isImport: event.target.value })}><option value="">Non renseigné</option><option value="true">Oui</option><option value="false">Non</option></select></label>
              <label>Exportation<select value={taxFacts.isExport} onChange={(event) => setTaxFacts({ ...taxFacts, isExport: event.target.value })}><option value="">Non renseigné</option><option value="true">Oui</option><option value="false">Non</option></select></label>
              <label>Catégorie de biens<input value={taxFacts.goodsCategory} onChange={(event) => setTaxFacts({ ...taxFacts, goodsCategory: event.target.value })} placeholder="Catégorie documentée"/></label>
            </div>
          </details>
          <p className="muted-note">L’émission exige un snapshot fiscal immuable. Après émission, la facture et ses documents ne peuvent plus être modifiés.</p>
        </section>

        {selectedInvoice?.status === "ISSUED" && <section className="panel invoice-list-panel">
          <div className="panel-heading"><div><h2>Documents et avoirs</h2><p>{selectedInvoice.invoiceCode} · documents d’émission immuables</p></div></div>
          <div className="invoice-form-grid credit-note-form"><label>Facture d’acompte<select value={advanceInvoiceId} onChange={event=>setAdvanceInvoiceId(event.target.value)}><option value="">Choisir une facture d’acompte payée</option>{invoices.filter(item=>item.status==="ISSUED"&&item.document?.invoiceKind==="ADVANCE"&&item.id!==selectedInvoice.id&&item.currencyCode===selectedInvoice.currencyCode).map(item=><option key={item.id} value={item.id}>{item.invoiceCode||item.id.slice(0,8)} · {item.grandTotal} {item.currencyCode}</option>)}</select></label><label>Montant d’acompte à appliquer<input inputMode="decimal" value={advanceAppliedAmount} onChange={event=>setAdvanceAppliedAmount(event.target.value)}/></label><label>Référence source<input value={advanceReference} onChange={event=>setAdvanceReference(event.target.value)} placeholder="Contrat / commande"/></label><div className="credit-note-button"><button className="primary-button" disabled={busy||!canIssue||!advanceInvoiceId||!advanceAppliedAmount} onClick={()=>void applyAdvance(selectedInvoice)}>Appliquer l’acompte</button></div></div>
          <div className="invoice-action-bar"><button className="outline-button" disabled={busy} onClick={()=>void loadInvoiceRelationships(selectedInvoice)}><ReceiptText size={15}/> Charger les acomptes liés</button></div>
          {relationships.length>0&&<div className="table-scroll"><table className="invoice-table"><thead><tr><th>Facture d’acompte</th><th>Référence</th><th>Montant appliqué</th><th>Relation</th></tr></thead><tbody>{relationships.map(item=><tr key={item.id}><td>{item.advance_invoice_code||item.source_invoice_id}</td><td>{item.source_reference||"—"}</td><td>{item.applied_amount} {selectedInvoice.currencyCode}</td><td>{item.relationship_type}</td></tr>)}</tbody></table></div>}<div className="invoice-action-bar">
            <button className="outline-button" disabled={busy} onClick={() => void downloadDocument(selectedInvoice, "document")}><Download size={15}/> HTML</button>
            <button className="outline-button" disabled={busy} onClick={() => void downloadDocument(selectedInvoice, "document.pdf")}><Download size={15}/> PDF</button>
            <button className="outline-button" disabled={busy} onClick={() => void loadCreditNotes(selectedInvoice)}><ReceiptText size={15}/> Charger les avoirs intégraux</button><button className="outline-button" disabled={busy} onClick={() => void loadAdjustments(selectedInvoice)}><ReceiptText size={15}/> Corrections partielles</button>
          </div>
          <div className="invoice-form-grid credit-note-form"><label>Type de correction<select value={adjustmentType} onChange={event=>{const next=event.target.value as "CREDIT_NOTE"|"DEBIT_NOTE";setAdjustmentType(next);if(selectedInvoice)setAdjustmentQuantities(Object.fromEntries(selectedInvoice.lines.map(line=>[line.id,next==="CREDIT_NOTE"?line.quantity:"1"]));}}><option value="CREDIT_NOTE">Avoir partiel</option><option value="DEBIT_NOTE">Note de débit</option></select></label><label>Motif<input value={adjustmentReason} onChange={event=>setAdjustmentReason(event.target.value)} minLength={3} maxLength={2000}/></label></div>
          <div className="table-scroll"><table className="invoice-table"><thead><tr><th>Ligne source</th><th>Qté initiale</th><th>{adjustmentType==="CREDIT_NOTE"?"Qté à créditer":"Qté additionnelle"}</th></tr></thead><tbody>{selectedInvoice.lines.map(line=><tr key={line.id}><td>{line.description}</td><td>{line.quantity}</td><td><input aria-label={"Quantité corrigée pour "+line.description} inputMode="decimal" value={adjustmentQuantities[line.id]??"0"} onChange={event=>setAdjustmentQuantities(v=>({...v,[line.id]:event.target.value}))}/></td></tr>)}</tbody></table></div>
          <div className="credit-note-button"><button className="primary-button" disabled={busy||!canCredit||adjustmentReason.trim().length<3} onClick={()=>void issueAdjustment(selectedInvoice)}>Émettre la correction</button></div>
          {adjustments.length>0&&<div className="table-scroll"><table className="invoice-table"><thead><tr><th>Référence</th><th>Type</th><th>Motif</th><th>Montant</th><th>Document</th></tr></thead><tbody>{adjustments.map(a=><tr key={a.id}><td><strong>{a.adjustment_code}</strong></td><td>{a.adjustment_type==="CREDIT_NOTE"?"Avoir":"Note de débit"}</td><td>{a.reason}</td><td>{a.currency_code} {a.grand_total}</td><td><button className="small-action" onClick={()=>void downloadAdjustment(a)} title="Télécharger HTML"><Download size={14}/></button></td></tr>)}</tbody></table></div>}
          <div className="invoice-form-grid credit-note-form"><label>Motif de l’avoir intégral<input value={creditReason} onChange={(event) => setCreditReason(event.target.value)} minLength={3} maxLength={2000}/></label><div className="credit-note-button"><button className="primary-button" disabled={busy || !canCredit || creditReason.trim().length < 3} onClick={() => void issueCreditNote(selectedInvoice)}>Créer un avoir intégral</button></div></div>
          {creditNotes.length > 0 && <div className="table-scroll"><table className="invoice-table"><thead><tr><th>Avoir</th><th>Motif</th><th>Montant</th><th>Date</th><th>Documents</th></tr></thead><tbody>{creditNotes.map((note) => <tr key={note.id}><td><strong>{note.creditNoteCode}</strong></td><td>{note.reason}</td><td>{note.currencyCode} {note.grandTotal}</td><td>{new Date(note.issuedAt).toLocaleDateString("fr-FR")}</td><td><div className="invoice-actions"><button className="small-action" title="HTML" onClick={() => void downloadCreditNote(note.id, "document", note.creditNoteCode)}><Download size={14}/></button><button className="small-action" title="PDF" onClick={() => void downloadCreditNote(note.id, "document.pdf", note.creditNoteCode)}><FileText size={14}/></button></div></td></tr>)}</tbody></table></div>}
        </section>}
    {notice && <div className="notice invoice-notice" role="status"><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Fermer">×</button></div>}
  </section>;
}
