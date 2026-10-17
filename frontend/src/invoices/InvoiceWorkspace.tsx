import { useEffect, useState, type FormEvent } from "react";
import { FileText, KeyRound, LogOut, RefreshCw, ShieldCheck } from "lucide-react";

type ApiError = { error?: { code?: string; message?: string } };
type SessionUser = { id: string; email?: string };
type TenantAccess = { id: string; tenantCode: string; legalName: string; role: string };
type Invoice = {
  id: string;
  invoiceCode: string | null;
  status: "DRAFT" | "ISSUED" | "CANCELLED";
  currencyCode: string;
  grandTotal: string;
  amountDue: string;
  createdAt: string;
  customerSnapshot?: { legalName?: string; displayName?: string };
};
type InvoiceResponse = { data?: { invoices?: Invoice[]; page?: { count: number; limit: number } } } & ApiError;
type SupabaseConfig = { data?: { supabaseUrl: string; supabaseAnonKey: string } } & ApiError;

async function responseError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = await response.json() as ApiError;
    return payload.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

export function InvoiceWorkspace() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [tenants, setTenants] = useState<TenantAccess[]>([]);
  const [loadingTenants, setLoadingTenants] = useState(false);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function loadTenantDirectory() {
    setLoadingTenants(true);
    try {
      const response = await fetch("/api/v1/user/tenants", { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error(await responseError(response, "Impossible de charger vos organisations."));
      const payload = await response.json() as { data?: { tenants?: TenantAccess[] } };
      const available = payload.data?.tenants ?? [];
      setTenants(available);
      setTenantId((current) => available.some((tenant) => tenant.id === current) ? current : (available[0]?.id ?? ""));
    } catch (error) {
      setTenants([]);
      setTenantId("");
      setNotice(error instanceof Error ? error.message : "Impossible de charger vos organisations.");
    } finally {
      setLoadingTenants(false);
    }
  }

  async function checkSession() {
    setChecking(true);
    try {
      const response = await fetch("/api/v1/user/session", { credentials: "same-origin", cache: "no-store" });
      if (response.ok) {
        const payload = await response.json() as { data?: SessionUser };
        const sessionUser = payload.data ?? null;
        setUser(sessionUser);
        if (sessionUser) await loadTenantDirectory();
      } else {
        setUser(null);
        setTenants([]);
      }
    } catch {
      setUser(null);
      setNotice("L’API Finance est inaccessible. Vérifiez que le backend est démarré.");
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => { void checkSession(); }, []);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      const configResponse = await fetch("/api/v1/user/session/config", { cache: "no-store" });
      if (!configResponse.ok) throw new Error(await responseError(configResponse, "Configuration d’authentification indisponible."));
      const config = await configResponse.json() as SupabaseConfig;
      if (!config.data) throw new Error("Configuration d’authentification incomplète.");

      const authResponse = await fetch(`${config.data.supabaseUrl.replace(/\/$/, "")}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { "content-type": "application/json", apikey: config.data.supabaseAnonKey },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (!authResponse.ok) throw new Error(await responseError(authResponse, "Connexion refusée. Vérifiez vos identifiants."));
      const auth = await authResponse.json() as { access_token?: string; user?: { id?: string; email?: string } };
      if (!auth.access_token) throw new Error("Le fournisseur d’identité n’a pas renvoyé de session valide.");

      const exchange = await fetch("/api/v1/user/session", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accessToken: auth.access_token }),
      });
      if (!exchange.ok) throw new Error(await responseError(exchange, "La session sécurisée n’a pas pu être créée."));
      const session = await exchange.json() as { data?: SessionUser };
      setUser(session.data ?? { id: auth.user?.id ?? "", ...(auth.user?.email ? { email: auth.user.email } : {}) });
      setPassword("");
      await loadTenantDirectory();
      setNotice("Connexion sécurisée établie.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Une erreur inattendue est survenue.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    try {
      await fetch("/api/v1/user/session", { method: "DELETE", credentials: "same-origin" });
    } finally {
      setUser(null);
      setInvoices([]);
      setTenants([]);
      setTenantId("");
      setBusy(false);
      setNotice("Session fermée.");
    }
  }

  async function loadInvoices(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tenantId.trim())) {
      setNotice("Saisissez l’identifiant UUID valide de l’organisation Finance.");
      return;
    }
    setLoading(true);
    setNotice("");
    try {
      const response = await fetch(`/api/v1/user/tenants/${encodeURIComponent(tenantId.trim())}/invoices?limit=50`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (response.status === 401) {
        setUser(null);
        throw new Error("Votre session a expiré. Connectez-vous à nouveau.");
      }
      if (!response.ok) throw new Error(await responseError(response, "Impossible de charger les factures."));
      const payload = await response.json() as InvoiceResponse;
      setInvoices(payload.data?.invoices ?? []);
      setNotice(`${payload.data?.invoices?.length ?? 0} facture(s) chargée(s).`);
    } catch (error) {
      setInvoices([]);
      setNotice(error instanceof Error ? error.message : "Une erreur inattendue est survenue.");
    } finally {
      setLoading(false);
    }
  }

  return <section className="invoice-workspace">
    <div className="invoice-heading">
      <div><div className="eyebrow"><FileText size={14}/> GESTION FINANCIÈRE</div><h1>Factures</h1><p className="subtitle">Consultez les factures de vos organisations autorisées.</p></div>
      {user && <button className="outline-button" disabled={busy} onClick={() => void signOut()}><LogOut size={15}/> Déconnexion</button>}
    </div>
    <div className="demo-banner"><div className="demo-icon"><ShieldCheck size={19}/></div><div><strong>Accès sécurisé en lecture seule</strong><p>La session est conservée dans un cookie HttpOnly. Chaque requête vérifie l’identité, l’appartenance à l’organisation et le droit de lecture côté serveur.</p></div><span className="demo-pill">BFF</span></div>

    {checking ? <section className="panel invoice-state"><RefreshCw className="spin" size={22}/><strong>Vérification de la session…</strong></section> :
      !user ? <section className="panel invoice-auth-panel">
        <div className="invoice-auth-icon"><KeyRound size={22}/></div><h2>Connexion à ZENOX Finance</h2>
        <p>Utilisez votre compte existant du fournisseur d’identité configuré pour Finance.</p>
        <form onSubmit={(event) => void signIn(event)} className="invoice-login-form">
          <label>Adresse e-mail<input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="vous@entreprise.com"/></label>
          <label>Mot de passe<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={1}/></label>
          <button className="primary-button" type="submit" disabled={busy}>{busy ? "Connexion…" : "Se connecter"} <KeyRound size={16}/></button>
        </form>
        <small className="muted-note">Aucun mot de passe ni jeton d’accès n’est enregistré dans le stockage du navigateur.</small>
      </section> :
      <section className="panel invoice-list-panel">
        <div className="panel-heading"><div><h2>Liste des factures</h2><p>Connecté{user.email ? ` en tant que ${user.email}` : ""} · données chargées depuis l’API</p></div><span className="status-chip"><i/> Session active</span></div>
        <form className="tenant-lookup-form" onSubmit={(event) => void loadInvoices(event)}>
          <label>Organisation autorisée
            <select value={tenantId} onChange={(event) => { setTenantId(event.target.value); setInvoices([]); }} required disabled={loadingTenants || tenants.length === 0}>
              {tenants.length === 0 ? <option value="">{loadingTenants ? "Chargement des organisations…" : "Aucune organisation accessible"}</option> : tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.legalName} · {tenant.tenantCode} · {tenant.role}</option>)}
            </select>
          </label>
          <button className="primary-button" type="submit" disabled={loading || loadingTenants || !tenantId}>{loading ? "Chargement…" : "Afficher les factures"} <RefreshCw size={15}/></button>
        </form>
        {tenants.length === 0 && !loadingTenants && <p className="muted-note">Aucune organisation active n’est associée à ce compte. Demandez à un administrateur Finance de vérifier votre invitation et votre rôle.</p>}
        <div className="table-scroll"><table className="invoice-table"><thead><tr><th>Référence</th><th>Client</th><th>Statut</th><th>Devise</th><th>Total</th><th>Reste dû</th><th>Créée le</th></tr></thead>
          <tbody>{invoices.length ? invoices.map((invoice) => <tr key={invoice.id}><td><strong>{invoice.invoiceCode ?? "Brouillon"}</strong><small>{invoice.id.slice(0, 8)}…</small></td><td>{invoice.customerSnapshot?.displayName ?? invoice.customerSnapshot?.legalName ?? "—"}</td><td><span className={`invoice-status ${invoice.status.toLowerCase()}`}>{invoice.status}</span></td><td>{invoice.currencyCode}</td><td>{invoice.grandTotal}</td><td>{invoice.amountDue}</td><td>{invoice.createdAt ? new Date(invoice.createdAt).toLocaleDateString("fr-FR") : "—"}</td></tr>) : <tr><td colSpan={7} className="invoice-empty">{loading ? "Chargement des factures…" : "Aucune facture affichée. Saisissez un identifiant d’organisation autorisée puis chargez les données."}</td></tr>}</tbody>
        </table></div>
        <p className="muted-note">Les montants sont affichés tels que renvoyés par le serveur. Cette vue ne crée, ne modifie et n’émet aucune facture.</p>
      </section>
    }
    {notice && <div className="notice invoice-notice" role="status"><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Fermer">×</button></div>}
  </section>;
}
