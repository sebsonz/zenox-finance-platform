import { useEffect, useState, type FormEvent } from "react";
import { FileText, KeyRound, LogOut, RefreshCw, ShieldCheck, Plus, Trash2, Download, Pencil, Send, ReceiptText } from "lucide-react";

type ApiError = { error?: { code?: string; message?: string } };
type SessionUser = { id: string; email?: string };
type TenantAccess = { id: string; tenantCode: string; legalName: string; role: string };
type Customer = { id: string; customerCode: string; legalName: string; displayName: string | null; status: "ACTIVE" | "ARCHIVED"; defaultCurrency: string | null };
type Currency = { code: string; name: string; minorUnit: number };
type Jurisdiction = { id: string; code: string; countryCode: string; name: string; level: string };
type InvoiceLine = { id?: string; description: string; quantity: string; unitPrice: string; discountPercent: string; taxRatePercent: string };
type Invoice = {
  id: string; customerId: string; invoiceCode: string | null; status: "DRAFT" | "ISSUED" | "CANCELLED";
  currencyCode: string; currencyMinorUnit: number; grandTotal: string; amountDue: string; subtotal: string;
  taxTotal: string; createdAt: string; updatedAt: string; dueDate: string | null; notes: string | null;
  documentVersion: number; taxSnapshotId: string | null; taxStatus: "PROVISIONAL" | "CALCULATED" | "REVIEW_REQUIRED";
  customerSnapshot?: { legalName?: string; displayName?: string };
  lines: Array<{ id: string; description: string; quantity: string; unitPrice: string; discountPercent: string; taxRatePercent: string; total: string }>;
};
type CreditNote = { id: string; originalInvoiceId: string; creditNoteCode: string; status: "ISSUED"; reason: string; currencyCode: string; grandTotal: string; amountDue: string; issuedAt: string };
type DraftForm = { customerId: string; currencyCode: string; dueDate: string; notes: string; lines: InvoiceLine[] };
type ApiPayload<T> = { data?: T } & ApiError;
const emptyLine = (): InvoiceLine => ({ description: "", quantity: "1", unitPrice: "0", discountPercent: "0", taxRatePercent: "0" });
const emptyForm = (): DraftForm => ({ customerId: "", currencyCode: "XOF", dueDate: "", notes: "", lines: [emptyLine()] });

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

export function InvoiceWorkspace() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [tenants, setTenants] = useState<TenantAccess[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [jurisdictions, setJurisdictions] = useState<Jurisdiction[]>([]);
  const [jurisdictionId, setJurisdictionId] = useState("");
  const [taxDate, setTaxDate] = useState(new Date().toISOString().slice(0, 10));
  const [appliesTo, setAppliesTo] = useState("GOODS");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [creditNotes, setCreditNotes] = useState<CreditNote[]>([]);
  const [creditReason, setCreditReason] = useState("Annulation de la facture d’origine");
  const [form, setForm] = useState<DraftForm>(emptyForm());
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingTenants, setLoadingTenants] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [checkingResources, setCheckingResources] = useState(false);

  async function loadTenantDirectory(): Promise<boolean> {
    setLoadingTenants(true);
    try {
      const data = await readData<{ tenants?: TenantAccess[] }>(await fetch("/api/v1/user/tenants", { credentials: "same-origin", cache: "no-store" }), "Impossible de charger vos organisations.");
      const available = data.tenants ?? [];
      setTenants(available);
      setTenantId((current) => available.some((tenant) => tenant.id === current) ? current : (available[0]?.id ?? ""));
      return true;
    } catch (error) { setTenants([]); setTenantId(""); setNotice(error instanceof Error ? error.message : "Impossible de charger vos organisations."); return false; }
    finally { setLoadingTenants(false); }
  }

  async function checkSession() {
    setChecking(true);
    try {
      const response = await fetch("/api/v1/user/session", { credentials: "same-origin", cache: "no-store" });
      if (response.ok) {
        const payload = await response.json() as { data?: SessionUser };
        setUser(payload.data ?? null);
        if (payload.data) await loadTenantDirectory();
      } else { setUser(null); setTenants([]); }
    } catch { setUser(null); setNotice("L’API Finance est inaccessible. Vérifiez que le backend est démarré."); }
    finally { setChecking(false); }
  }
  useEffect(() => { void checkSession(); }, []);

  useEffect(() => {
    if (!user || !tenantId) return;
    let cancelled = false;
    async function loadResources() {
      setCheckingResources(true);
      try {
        const [customerData, currencyData, jurisdictionData] = await Promise.all([
          readData<{ customers?: Customer[] }>(await fetch(`/api/v1/user/tenants/${tenantId}/customers?status=ACTIVE&limit=100`, { credentials: "same-origin", cache: "no-store" }), "Impossible de charger les clients."),
          readData<{ currencies?: Currency[] }>(await fetch(`/api/v1/user/tenants/${tenantId}/currencies`, { credentials: "same-origin", cache: "no-store" }), "Impossible de charger les devises."),
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
  }, [user, tenantId]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setNotice("");
    try {
      const configResponse = await fetch("/api/v1/user/session/config", { cache: "no-store" });
      const config = await readData<{ supabaseUrl: string; supabaseAnonKey: string }>(configResponse, "Configuration d’authentification indisponible.");
      const authResponse = await fetch(`${config.supabaseUrl.replace(/\/$/, "")}/auth/v1/token?grant_type=password`, {
        method: "POST", headers: { "content-type": "application/json", apikey: config.supabaseAnonKey },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (!authResponse.ok) throw new Error(await responseError(authResponse, "Connexion refusée. Vérifiez vos identifiants."));
      const auth = await authResponse.json() as { access_token?: string; user?: { id?: string; email?: string } };
      if (!auth.access_token) throw new Error("Le fournisseur d’identité n’a pas renvoyé de session valide.");
      const exchange = await fetch("/api/v1/user/session", {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({ accessToken: auth.access_token }),
      });
      const session = await readData<SessionUser>(exchange, "La session sécurisée n’a pas pu être créée.");
      setUser(session ?? { id: auth.user?.id ?? "", ...(auth.user?.email ? { email: auth.user.email } : {}) });
      setPassword("");
      if (await loadTenantDirectory()) setNotice("Connexion sécurisée établie.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Une erreur inattendue est survenue."); }
    finally { setBusy(false); }
  }

  async function signOut() {
    setBusy(true); let message = "Session fermée.";
    try { const response = await fetch("/api/v1/user/session", { method: "DELETE", credentials: "same-origin", cache: "no-store" }); if (!response.ok) message = await responseError(response, "La fermeture de session n’a pas été confirmée."); }
    catch { message = "Le serveur n’a pas confirmé la fermeture de session."; }
    finally { setUser(null); setInvoices([]); setTenants([]); setTenantId(""); setSelectedInvoiceId(""); setBusy(false); setNotice(message); }
  }

  async function loadInvoices(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault(); if (!tenantId) { setNotice("Sélectionnez une organisation autorisée."); return; }
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
    if (!tenantId || !form.customerId || !form.currencyCode || form.lines.some((line) => !line.description.trim())) {
      setNotice("Renseignez le client, la devise et la description de chaque ligne."); return;
    }
    setBusy(true); setNotice("");
    const payload = {
      customerId: form.customerId, currencyCode: form.currencyCode,
      ...(form.dueDate ? { dueDate: form.dueDate } : {}),
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
      setNotice(editing ? "Brouillon mis à jour." : "Brouillon créé.");
      setEditing(data.invoice); setSelectedInvoiceId(data.invoice.id);
      await loadInvoices();
      const refreshed = await fetch(`/api/v1/user/tenants/${tenantId}/invoices?limit=100`, { credentials: "same-origin", cache: "no-store" });
      const refreshedData = await readData<{ invoices?: Invoice[] }>(refreshed, "Impossible d’actualiser les factures.");
      setInvoices(refreshedData.invoices ?? []);
      const saved = (refreshedData.invoices ?? []).find((item) => item.id === data.invoice.id) ?? data.invoice;
      setEditing(saved);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Erreur d’enregistrement."); }
    finally { setBusy(false); }
  }

  async function calculateTax(invoice: Invoice) {
    if (!jurisdictionId) { setNotice("Aucune juridiction fiscale active n’est disponible."); return; }
    setBusy(true); setNotice("");
    try {
      const response = await fetch(`/api/v1/user/tenants/${tenantId}/invoices/${invoice.id}/tax-snapshot`, {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedUpdatedAt: invoice.updatedAt, taxDate, jurisdictionId, appliesTo }),
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
  const currentRole = tenants.find((tenant) => tenant.id === tenantId)?.role ?? "";
  const canIssue = ["OWNER", "ADMIN", "FINANCE_MANAGER"].includes(currentRole);
  const canManageTax = canIssue;
  const canCredit = canIssue;
  return <section className="invoice-workspace">
    <div className="invoice-heading">
      <div><div className="eyebrow"><FileText size={14}/> GESTION FINANCIÈRE</div><h1>Factures</h1><p className="subtitle">Brouillons, calcul fiscal, émission et documents immuables.</p></div>
      {user && <button className="outline-button" disabled={busy} onClick={() => void signOut()}><LogOut size={15}/> Déconnexion</button>}
    </div>
    <div className="demo-banner"><div className="demo-icon"><ShieldCheck size={19}/></div><div><strong>Opérations sécurisées côté serveur</strong><p>Chaque écriture vérifie la session, le tenant et les permissions. L’émission est idempotente et irréversible.</p></div><span className="demo-pill">BFF</span></div>

    {checking ? <section className="panel invoice-state"><RefreshCw className="spin" size={22}/><strong>Vérification de la session…</strong></section> :
      !user ? <section className="panel invoice-auth-panel">
        <div className="invoice-auth-icon"><KeyRound size={22}/></div><h2>Connexion à ZENOX Finance</h2>
        <p>Utilisez votre compte existant du fournisseur d’identité configuré pour Finance.</p>
        <form onSubmit={(event) => void signIn(event)} className="invoice-login-form">
          <label>Adresse e-mail<input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="vous@entreprise.com"/></label>
          <label>Mot de passe<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={1}/></label>
          <button className="primary-button" type="submit" disabled={busy}>{busy ? "Connexion…" : "Se connecter"} <KeyRound size={16}/></button>
        </form><small className="muted-note">Aucun mot de passe ni jeton d’accès n’est enregistré dans le stockage du navigateur.</small>
      </section> :
      <>
        <section className="panel invoice-list-panel">
          <div className="panel-heading"><div><h2>Espace de facturation</h2><p>Connecté{user.email ? ` en tant que ${user.email}` : ""} · ${checkingResources ? "Chargement des référentiels…" : `${customers.length} client(s), ${currencies.length} devise(s)`}</p></div><span className="status-chip"><i/> Session active</span></div>
          <form className="tenant-lookup-form" onSubmit={(event) => void loadInvoices(event)}>
            <label>Organisation autorisée<select value={tenantId} onChange={(event) => { setTenantId(event.target.value); setInvoices([]); setSelectedInvoiceId(""); setEditing(null); }} required disabled={loadingTenants || tenants.length === 0}>
              {tenants.length === 0 ? <option value="">{loadingTenants ? "Chargement…" : "Aucune organisation accessible"}</option> : tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.legalName} · {tenant.tenantCode} · {tenant.role}</option>)}
            </select></label>
            <button className="primary-button" type="submit" disabled={loading || loadingTenants || !tenantId}>{loading ? "Chargement…" : "Actualiser"} <RefreshCw size={15}/></button>
          </form>
        </section>

        <section className="panel invoice-list-panel">
          <div className="panel-heading"><div><h2>{editing ? "Modifier le brouillon" : "Créer une facture"}</h2><p>Le serveur calcule tous les montants. Une modification invalide le snapshot fiscal précédent.</p></div>{editing && <button className="outline-button" onClick={resetDraft}>Annuler la modification</button>}</div>
          <form className="invoice-editor" onSubmit={(event) => void saveDraft(event)}>
            <div className="invoice-form-grid">
              <label>Client<select value={form.customerId} onChange={(event) => setForm({ ...form, customerId: event.target.value })} required>
                <option value="">Choisir un client actif</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.displayName || customer.legalName} · {customer.customerCode}</option>)}
              </select></label>
              <label>Devise<select value={form.currencyCode} onChange={(event) => setForm({ ...form, currencyCode: event.target.value })} required>
                {currencies.map((currency) => <option key={currency.code} value={currency.code}>{currency.code} · {currency.name}</option>)}
              </select></label>
              <label>Date d’échéance<input type="date" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })}/></label>
              <label>Notes<input value={form.notes} maxLength={5000} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Conditions ou référence interne"/></label>
            </div>
            <div className="invoice-lines-heading"><h3>Lignes de facture</h3><button className="outline-button" type="button" onClick={() => setForm({ ...form, lines: [...form.lines, emptyLine()] })} disabled={form.lines.length >= 500}><Plus size={14}/> Ajouter une ligne</button></div>
            {form.lines.map((line, index) => <div className="invoice-line-editor" key={index}>
              <label className="line-description">Description<input value={line.description} maxLength={500} onChange={(event) => updateLine(index, "description", event.target.value)} required/></label>
              <label>Qté<input inputMode="decimal" value={line.quantity} onChange={(event) => updateLine(index, "quantity", event.target.value)} required/></label>
              <label>Prix unitaire<input inputMode="decimal" value={line.unitPrice} onChange={(event) => updateLine(index, "unitPrice", event.target.value)} required/></label>
              <label>Remise %<input inputMode="decimal" value={line.discountPercent} onChange={(event) => updateLine(index, "discountPercent", event.target.value)} required/></label>
              <label>Taxe provisoire %<input inputMode="decimal" value={line.taxRatePercent} onChange={(event) => updateLine(index, "taxRatePercent", event.target.value)} required/></label>
              <button className="icon-danger" type="button" title="Supprimer la ligne" disabled={form.lines.length === 1} onClick={() => setForm({ ...form, lines: form.lines.filter((_, i) => i !== index) })}><Trash2 size={15}/></button>
            </div>)}
            <button className="primary-button" type="submit" disabled={busy || checkingResources || customers.length === 0 || currencies.length === 0}>{busy ? "Enregistrement…" : editing ? "Enregistrer les modifications" : "Créer le brouillon"} <FileText size={15}/></button>
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
          <p className="muted-note">L’émission exige un snapshot fiscal immuable. Après émission, la facture et ses documents ne peuvent plus être modifiés.</p>
        </section>

        {selectedInvoice?.status === "ISSUED" && <section className="panel invoice-list-panel">
          <div className="panel-heading"><div><h2>Documents et avoirs</h2><p>{selectedInvoice.invoiceCode} · documents d’émission immuables</p></div></div>
          <div className="invoice-action-bar">
            <button className="outline-button" disabled={busy} onClick={() => void downloadDocument(selectedInvoice, "document")}><Download size={15}/> HTML</button>
            <button className="outline-button" disabled={busy} onClick={() => void downloadDocument(selectedInvoice, "document.pdf")}><Download size={15}/> PDF</button>
            <button className="outline-button" disabled={busy} onClick={() => void loadCreditNotes(selectedInvoice)}><ReceiptText size={15}/> Charger les avoirs</button>
          </div>
          <div className="invoice-form-grid credit-note-form"><label>Motif de l’avoir intégral<input value={creditReason} onChange={(event) => setCreditReason(event.target.value)} minLength={3} maxLength={2000}/></label><div className="credit-note-button"><button className="primary-button" disabled={busy || !canCredit || creditReason.trim().length < 3} onClick={() => void issueCreditNote(selectedInvoice)}>Créer un avoir intégral</button></div></div>
          {creditNotes.length > 0 && <div className="table-scroll"><table className="invoice-table"><thead><tr><th>Avoir</th><th>Motif</th><th>Montant</th><th>Date</th><th>Documents</th></tr></thead><tbody>{creditNotes.map((note) => <tr key={note.id}><td><strong>{note.creditNoteCode}</strong></td><td>{note.reason}</td><td>{note.currencyCode} {note.grandTotal}</td><td>{new Date(note.issuedAt).toLocaleDateString("fr-FR")}</td><td><div className="invoice-actions"><button className="small-action" title="HTML" onClick={() => void downloadCreditNote(note.id, "document", note.creditNoteCode)}><Download size={14}/></button><button className="small-action" title="PDF" onClick={() => void downloadCreditNote(note.id, "document.pdf", note.creditNoteCode)}><FileText size={14}/></button></div></td></tr>)}</tbody></table></div>}
        </section>}
      </>
    }
    {notice && <div className="notice invoice-notice" role="status"><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Fermer">×</button></div>}
  </section>;
}
