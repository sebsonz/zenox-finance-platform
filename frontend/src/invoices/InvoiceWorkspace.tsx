import { useEffect, useState, type FormEvent } from "react";
import { InvoiceTypeFields } from "../modules/billing/freight/invoices/types/InvoiceTypeFields.js";
import { InvoiceLinesEditor } from "../modules/billing/freight/invoices/components/InvoiceLinesEditor.js";
import { IssuedInvoiceDocumentsPanel } from "../modules/billing/freight/invoices/credit-notes/IssuedInvoiceDocumentsPanel.js";
import { FileText, RefreshCw, ShieldCheck, Download, Pencil, Send, ReceiptText } from "lucide-react";

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
type InvoiceLine = { id?: string; description: string; quantity: string; unitPrice: string; discountPercent: string; taxRatePercent: string };
type Invoice = {
  id: string; customerId: string; invoiceCode: string | null; status: "DRAFT" | "ISSUED" | "CANCELLED";
  documentType: "STANDARD" | "DEPOSIT" | "BALANCE"; contractTotal: string | null; relatedInvoiceId: string | null;
  currencyCode: string; currencyMinorUnit: number; grandTotal: string; amountDue: string; subtotal: string;
  taxTotal: string; createdAt: string; updatedAt: string; dueDate: string | null; notes: string | null;
  purchaseOrderReference: string | null; serviceDate: string | null; paymentTerms: string | null;
  paymentInstructions: string | null; externalReference: string | null; footerNote: string | null;
  documentVersion: number; taxSnapshotId: string | null; taxStatus: "PROVISIONAL" | "CALCULATED" | "REVIEW_REQUIRED";
  customerSnapshot?: { legalName?: string; displayName?: string };
  lines: Array<{ id: string; description: string; quantity: string; unitPrice: string; discountPercent: string; taxRatePercent: string; total: string }>;
};
type CreditNote = { id: string; originalInvoiceId: string; creditNoteCode: string; creditKind: "FULL" | "PARTIAL"; status: "ISSUED"; reason: string; currencyCode: string; grandTotal: string; amountDue: string; issuedAt: string };
type DraftForm = {
  documentType: "STANDARD" | "DEPOSIT" | "BALANCE" | "CREDIT_NOTE"; contractTotal: string; relatedInvoiceId: string;
  customerId: string; currencyCode: string; dueDate: string; notes: string;
  purchaseOrderReference: string; serviceDate: string; paymentTerms: string;
  paymentInstructions: string; externalReference: string; footerNote: string;
  lines: InvoiceLine[];
};
type ApiPayload<T> = { data?: T } & ApiError;
const emptyLine = (): InvoiceLine => ({ description: "", quantity: "1", unitPrice: "0", discountPercent: "0", taxRatePercent: "0" });
const emptyForm = (): DraftForm => ({
  documentType: "STANDARD", contractTotal: "", relatedInvoiceId: "",
  customerId: "", currencyCode: "XOF", dueDate: "", notes: "",
  purchaseOrderReference: "", serviceDate: "", paymentTerms: "",
  paymentInstructions: "", externalReference: "", footerNote: "", lines: [emptyLine()],
});

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
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [invoiceStatus, setInvoiceStatus] = useState("");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [creditNotes, setCreditNotes] = useState<CreditNote[]>([]);
  const [creditReason, setCreditReason] = useState("Correction commerciale / retour / annulation");
  const [creditAmount, setCreditAmount] = useState("");
  const [creditNoteReason, setCreditNoteReason] = useState("Correction commerciale / retour / annulation");
  const [creditNoteAmount, setCreditNoteAmount] = useState("");
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
    setEditing(null);
    setTaxFacts(emptyTaxFacts());
    let cancelled = false;
    async function loadResources() {
      setCheckingResources(true);
      setNotice("");
      const role = activeTenant.role;
      const canCreateInvoices = ["OWNER", "ADMIN", "FINANCE_MANAGER", "FINANCE_OPERATOR"].includes(role);

      // Reference data is deliberately loaded independently. A tax API outage
      // must never prevent the currency selector (or customer list) from loading.
      // Customer directory access is governed by customers:read, not by
      // invoices:create. The API remains the authority and returns 403 when
      // the active membership cannot read customers.
      const loadCustomers = async () => readData<{ customers?: Customer[] }>(
        await fetch(`/api/v1/user/tenants/${tenantId}/customers?status=ACTIVE&limit=100`, { credentials: "same-origin", cache: "no-store" }),
        "Impossible de charger les clients.",
      );
      const loadCurrencies = async () => canCreateInvoices
        ? readData<{ currencies?: Currency[] }>(
            await fetch(`/api/v1/user/tenants/${tenantId}/currencies`, { credentials: "same-origin", cache: "no-store" }),
            "Impossible de charger les devises.",
          )
        : { currencies: [] as Currency[] };
      const loadJurisdictions = async () => readData<{ jurisdictions?: Jurisdiction[] }>(
        await fetch(`/api/v1/user/tenants/${tenantId}/tax-jurisdictions`, { credentials: "same-origin", cache: "no-store" }),
        "Impossible de charger les juridictions fiscales.",
      );

      const [customerResult, currencyResult, jurisdictionResult] = await Promise.allSettled([
        loadCustomers(),
        loadCurrencies(),
        loadJurisdictions(),
      ]);

      if (cancelled) return;

      const errors: string[] = [];
      if (customerResult.status === "fulfilled") {
        const loadedCustomers = customerResult.value.customers ?? [];
        setCustomers(loadedCustomers);
        setForm((current) => ({
          ...current,
          customerId: current.customerId || loadedCustomers[0]?.id || "",
        }));
      } else {
        errors.push(customerResult.reason instanceof Error ? customerResult.reason.message : "Impossible de charger les clients.");
      }

      if (currencyResult.status === "fulfilled") {
        const loadedCurrencies = currencyResult.value.currencies ?? [];
        setCurrencies(loadedCurrencies);
        setForm((current) => ({
          ...current,
          currencyCode: loadedCurrencies.some((currency) => currency.code === current.currencyCode)
            ? current.currencyCode
            : (loadedCurrencies[0]?.code ?? "XOF"),
        }));
      } else {
        errors.push(currencyResult.reason instanceof Error ? currencyResult.reason.message : "Impossible de charger les devises.");
      }

      if (jurisdictionResult.status === "fulfilled") {
        const loadedJurisdictions = jurisdictionResult.value.jurisdictions ?? [];
        setJurisdictions(loadedJurisdictions);
        setJurisdictionId((current) => loadedJurisdictions.some((item) => item.id === current)
          ? current
          : (loadedJurisdictions[0]?.id ?? ""));
      } else {
        errors.push(jurisdictionResult.reason instanceof Error ? jurisdictionResult.reason.message : "Impossible de charger les juridictions fiscales.");
      }

      if (errors.length > 0) setNotice(errors.join(" "));
      setCheckingResources(false);
    }
    void loadResources().catch((error: unknown) => {
      if (cancelled) return;
      setNotice(error instanceof Error ? error.message : "Impossible de charger les référentiels de facturation.");
      setCheckingResources(false);
    });
    // Load invoices independently of customer/currency/tax reference APIs.
    void (async () => {
      try {
        const invoiceData = await readData<{ invoices?: Invoice[] }>(
          await fetch(`/api/v1/user/tenants/${tenantId}/invoices?limit=100`, { credentials: "same-origin", cache: "no-store" }),
          "Impossible de charger les factures.",
        );
        if (!cancelled) setInvoices(invoiceData.invoices ?? []);
      } catch (invoiceError) {
        if (!cancelled) setNotice(invoiceError instanceof Error ? invoiceError.message : "Impossible de charger les factures.");
      }
    })();
    return () => { cancelled = true; };
  }, [sessionUser.id, tenantId, activeTenant.role]);

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

  function resetDraft() {
    setEditing(null);
    setForm({ ...emptyForm(), customerId: customers[0]?.id ?? "", currencyCode: currencies[0]?.code ?? "XOF" });
  }
  function startEdit(invoice: Invoice) {
    if (invoice.status !== "DRAFT") { setNotice("Seuls les brouillons peuvent être modifiés."); return; }
    setEditing(invoice);
    setForm({
      documentType: invoice.documentType ?? "STANDARD", contractTotal: invoice.contractTotal ?? "", relatedInvoiceId: invoice.relatedInvoiceId ?? "",
      customerId: invoice.customerId, currencyCode: invoice.currencyCode, dueDate: invoice.dueDate ?? "", notes: invoice.notes ?? "",
      purchaseOrderReference: invoice.purchaseOrderReference ?? "", serviceDate: invoice.serviceDate ?? "",
      paymentTerms: invoice.paymentTerms ?? "", paymentInstructions: invoice.paymentInstructions ?? "",
      externalReference: invoice.externalReference ?? "", footerNote: invoice.footerNote ?? "",
      lines: invoice.lines.map((line) => ({ description: line.description, quantity: line.quantity, unitPrice: line.unitPrice, discountPercent: line.discountPercent, taxRatePercent: line.taxRatePercent })),
    });
    setSelectedInvoiceId(invoice.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function updateLine(index: number, field: keyof InvoiceLine, value: string) {
    setForm((current) => ({ ...current, lines: current.lines.map((line, i) => i === index ? { ...line, [field]: value } : line) }));
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
      setBusy(true); setNotice("");
      try {
        const response = await fetch(`/api/v1/user/tenants/${tenantId}/invoices/${source.id}/credit-notes`, {
          method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
          body: JSON.stringify({ reason: creditNoteReason.trim(), ...(creditNoteAmount.trim() ? { amount: creditNoteAmount.trim() } : {}) }),
        });
        await readData(response, "La création de l’avoir a échoué.");
        setSelectedInvoiceId(source.id);
        await loadCreditNotes(source);
        setCreditNoteAmount("");
        setNotice(creditNoteAmount.trim() ? "Avoir partiel émis et enregistré." : "Avoir intégral émis et enregistré.");
      } catch (error) { setNotice(error instanceof Error ? error.message : "La création de l’avoir a échoué."); }
      finally { setBusy(false); }
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

  async function loadCreditNotes(invoice: Invoice) {
    setSelectedInvoiceId(invoice.id);
    try {
      const data = await readData<{ creditNotes?: CreditNote[] }>(await fetch(`/api/v1/user/tenants/${tenantId}/invoices/${invoice.id}/credit-notes`, { credentials: "same-origin", cache: "no-store" }), "Impossible de charger les avoirs.");
      setCreditNotes(data.creditNotes ?? []);
    } catch (error) { setCreditNotes([]); setNotice(error instanceof Error ? error.message : "Impossible de charger les avoirs."); }
  }
  async function issueCreditNote(invoice: Invoice) {
    if (!window.confirm(creditAmount.trim() ? `Émettre un avoir partiel irréversible de ${creditAmount} ${invoice.currencyCode} ?` : "Créer un avoir intégral irréversible pour cette facture ?")) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/v1/user/tenants/${tenantId}/invoices/${invoice.id}/credit-notes`, {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: creditReason, ...(creditAmount.trim() ? { amount: creditAmount.trim() } : {}) }),
      });
      await readData(response, "La création de l’avoir a échoué.");
      setNotice(creditAmount.trim() ? "Avoir partiel émis et enregistré." : "Avoir intégral émis et enregistré.");
      setCreditAmount("");
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

  function openCreditNoteDocument(id: string) {
    // Open synchronously from the user's click so the authenticated document
    // response can be previewed and printed without a popup-blocker race.
    window.open(
      `/api/v1/user/tenants/${tenantId}/invoices/credit-notes/${id}/document`,
      "_blank",
      "noopener,noreferrer",
    );
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
              onAdd={() => setForm({ ...form, lines: [...form.lines, emptyLine()] })}
              onUpdate={updateLine}
              onRemove={(index) => setForm({ ...form, lines: form.lines.filter((_, i) => i !== index) })}
            />

            <div className="invoice-editor-submit-row"><button className="primary-button" type="submit" disabled={busy || (form.documentType === "CREDIT_NOTE" ? !form.relatedInvoiceId || !canCredit : checkingResources || customers.length === 0 || currencies.length === 0)}>{busy ? "Traitement…" : form.documentType === "CREDIT_NOTE" ? "Émettre la facture d’avoir" : editing ? "Enregistrer les modifications" : "Enregistrer la facture"} <FileText size={15}/></button></div>
            {form.documentType !== "CREDIT_NOTE" && customers.length === 0 && <p className="muted-note">Aucun client actif : ajoutez d’abord un client via le module Clients.</p>}
          </form>
        </section>

        <section className="panel invoice-list-panel">
          <div className="panel-heading"><div><h2>Factures de l’organisation</h2><p>{invoices.length} résultat(s) · recherche et filtres appliqués côté serveur.</p></div></div>
          <form className="tenant-lookup-form" onSubmit={(event) => void loadInvoices(event)}>
            <label>Recherche<input value={invoiceSearch} maxLength={120} onChange={(event) => setInvoiceSearch(event.target.value)} placeholder="N° facture, client, référence externe ou commande"/></label>
            <label>Statut<select value={invoiceStatus} onChange={(event) => setInvoiceStatus(event.target.value)}><option value="">Tous les statuts</option><option value="DRAFT">Brouillons</option><option value="ISSUED">Émises</option><option value="CANCELLED">Annulées</option></select></label>
            <button className="primary-button" type="submit" disabled={loading}>{loading ? "Recherche…" : "Rechercher"} <RefreshCw size={15}/></button>
          </form>
          <div className="table-scroll"><table className="invoice-table"><thead><tr><th>Référence</th><th>Type</th><th>Client</th><th>Statut</th><th>Taxe</th><th>Devise</th><th>Total</th><th>Actions</th></tr></thead>
            <tbody>{invoices.length ? invoices.map((invoice) => <tr key={invoice.id} className={selectedInvoiceId === invoice.id ? "selected-invoice-row" : ""}>
              <td><strong>{invoice.invoiceCode ?? "Brouillon"}</strong><small>{invoice.id.slice(0, 8)}…</small></td><td>{invoice.documentType === "DEPOSIT" ? "Acompte" : invoice.documentType === "BALANCE" ? "Solde" : "Standard"}</td><td>{invoice.customerSnapshot?.displayName ?? invoice.customerSnapshot?.legalName ?? "—"}</td>
              <td><span className={`invoice-status ${invoice.status.toLowerCase()}`}>{invoice.status}</span></td><td>{invoice.taxStatus === "CALCULATED" ? "Calculée" : invoice.taxStatus === "REVIEW_REQUIRED" ? "À revoir" : "Provisoire"}</td>
              <td>{invoice.currencyCode}</td><td>{invoice.grandTotal}</td><td><div className="invoice-actions">
                {invoice.status === "DRAFT" && <button title="Modifier" className="small-action" onClick={() => startEdit(invoice)}><Pencil size={14}/></button>}
                {invoice.status === "DRAFT" && <button title="Calculer la taxe" className="small-action" disabled={busy || !jurisdictionId || !canManageTax || invoice.taxStatus === "CALCULATED"} onClick={() => void calculateTax(invoice)}><ShieldCheck size={14}/></button>}
                {invoice.status === "DRAFT" && invoice.taxStatus === "CALCULATED" && <button title="Émettre" className="small-action" disabled={busy || !canIssue} onClick={() => void issueInvoice(invoice)}><Send size={14}/></button>}
                {invoice.status === "ISSUED" && <button title="Télécharger PDF" className="small-action" disabled={busy} onClick={() => void downloadDocument(invoice, "document.pdf")}><Download size={14}/></button>}
                {invoice.status === "ISSUED" && <button title="Historique des avoirs" className="small-action" onClick={() => void loadCreditNotes(invoice)}><ReceiptText size={14}/></button>}
              </div></td></tr>) : <tr><td colSpan={8} className="invoice-empty">{loading ? "Chargement…" : "Aucune facture enregistrée pour cette organisation."}</td></tr>}</tbody>
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

        <IssuedInvoiceDocumentsPanel
          invoice={selectedInvoice}
          creditNotes={creditNotes}
          creditReason={creditReason}
          creditAmount={creditAmount}
          remainingCredit={remainingCredit}
          busy={busy}
          canCredit={canCredit}
          onOpenInvoice={openIssuedDocument}
          onDownloadInvoice={downloadDocument}
          onLoadCreditNotes={loadCreditNotes}
          onCreditReasonChange={setCreditReason}
          onCreditAmountChange={setCreditAmount}
          onIssueCreditNote={issueCreditNote}
          onOpenCreditNote={openCreditNoteDocument}
          onDownloadCreditNote={downloadCreditNote}
        />
    {notice && <div className="notice invoice-notice" role="status"><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Fermer">×</button></div>}
  </section>;
}
