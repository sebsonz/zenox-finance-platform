import { useEffect, useState, type FormEvent } from "react";
import { RegistrationHomeLink } from "./RegistrationHomeLink";
import { BrandLogo } from "../shared/components/BrandLogo.js";
import { authConfig, exchangeSession, readData } from "./auth-api.js";
import "./PlatformEntryWorkspace.css";
import { Building2, CheckCircle2, CircleAlert, KeyRound, LoaderCircle, LogIn, Mail, ShieldCheck, UserPlus } from "lucide-react";

type User = { id: string; email?: string; emailConfirmedAt?: string | null };
type Currency = { code: string; name: string; minorUnit: number };
type RegistrationRequest = {
  id: string;
  tenantId: string;
  legalName: string;
  countryCode: string;
  defaultCurrency: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  submittedAt: string;
  updatedAt: string;
  rejectionReason?: string;
};
const TERMS_VERSION = "2026-10-draft";

export function RegistrationWorkspace({
  user,
  onSessionChanged,
  onBackToEntry,
  initialMode = "login",
}: {
  user: User | null;
  onSessionChanged: () => Promise<void>;
  onBackToEntry?: () => void;
  initialMode?: "login" | "signup";
}) {
  const [mode, setMode] = useState<"login" | "signup" | "forgot" | "reset">(initialMode);
  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [recoveryToken, setRecoveryToken] = useState("");
  const [legalName, setLegalName] = useState("");
  const [countryCode, setCountryCode] = useState("BJ");
  const [defaultCurrency, setDefaultCurrency] = useState("XOF");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [requests, setRequests] = useState<RegistrationRequest[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function loadRequests() {
    setLoadingRequests(true);
    try {
      const data = await readData<{ requests: RegistrationRequest[] }>(
        await fetch("/api/v1/user/registration/organizations", { credentials: "same-origin", cache: "no-store" }),
        "Impossible de charger vos demandes.",
      );
      setRequests(data.requests ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible de charger vos demandes.");
    } finally {
      setLoadingRequests(false);
    }
  }

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const accessToken = hash.get("access_token");
    const type = hash.get("type");
    if (accessToken && type === "recovery") {
      setRecoveryToken(accessToken);
      setMode("reset");
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    } else if (accessToken && (type === "signup" || type === "magiclink")) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      void exchangeSession(accessToken).then(onSessionChanged).catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "La confirmation n’a pas pu ouvrir la session.");
      });
    }
  }, []);

  useEffect(() => {
    if (!user || !user.emailConfirmedAt) return;
    void loadRequests();
    void fetch("/api/v1/user/registration/currencies", { credentials: "same-origin", cache: "no-store" })
      .then((response) => readData<{ currencies: Currency[] }>(response, "Le référentiel des devises est indisponible."))
      .then((data) => {
        setCurrencies(data.currencies ?? []);
        setDefaultCurrency((current) => data.currencies?.some((item) => item.code === current)
          ? current : (data.currencies?.[0]?.code ?? ""));
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Le référentiel des devises est indisponible."));
  }, [user?.id, user?.emailConfirmedAt]);

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const config = await authConfig();
      const baseUrl = config.supabaseUrl.replace(/\/$/, "");
      if (mode === "forgot") {
        const url = new URL(`${baseUrl}/auth/v1/recover`);
        url.searchParams.set("redirect_to", window.location.origin);
        const response = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json", apikey: config.supabaseAnonKey },
          body: JSON.stringify({ email: email.trim() }),
        });
        if (!response.ok) throw new Error("La demande de récupération n’a pas pu être envoyée. Réessayez plus tard.");
        setNotice("Si cette adresse correspond à un compte, un e-mail de récupération sera envoyé.");
        setMode("login");
        return;
      }

      if (mode === "reset") {
        if (newPassword.length < 12) throw new Error("Le nouveau mot de passe doit contenir au moins 12 caractères.");
        const response = await fetch(`${baseUrl}/auth/v1/user`, {
          method: "PUT",
          headers: {
            "content-type": "application/json",
            apikey: config.supabaseAnonKey,
            authorization: `Bearer ${recoveryToken}`,
          },
          body: JSON.stringify({ password: newPassword }),
        });
        if (!response.ok) throw new Error("Le nouveau mot de passe n’a pas pu être enregistré. Demandez un nouveau lien.");
        setPassword("");
        setNewPassword("");
        setNotice("Mot de passe modifié. Vous pouvez maintenant vous connecter.");
        setMode("login");
        return;
      }

      if (mode === "signup") {
        if (password.length < 12) throw new Error("Choisissez un mot de passe d’au moins 12 caractères.");
        if (password !== passwordConfirmation) throw new Error("Les deux mots de passe ne correspondent pas.");
        const url = new URL(`${baseUrl}/auth/v1/signup`);
        url.searchParams.set("redirect_to", window.location.origin);
        const response = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json", apikey: config.supabaseAnonKey },
          body: JSON.stringify({ email: email.trim(), password }),
        });
        if (!response.ok) {
          // Do not reveal whether an address is already registered.
          throw new Error("Inscription non finalisée. Vérifiez les informations ou consultez votre boîte e-mail.");
        }
        const auth = await response.json() as { access_token?: string };
        setPassword("");
        setPasswordConfirmation("");
        if (auth.access_token) {
          await exchangeSession(auth.access_token);
          await onSessionChanged();
        } else {
          setNotice("Si l’adresse peut être inscrite, un e-mail de confirmation vient d’être envoyé. Confirmez-le avant de soumettre votre organisation.");
          setMode("login");
        }
        return;
      }

      const response = await fetch(`${baseUrl}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { "content-type": "application/json", apikey: config.supabaseAnonKey },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (!response.ok) throw new Error("Connexion refusée. Vérifiez vos identifiants et la confirmation de votre adresse e-mail.");
      const auth = await response.json() as { access_token?: string };
      if (!auth.access_token) throw new Error("Le fournisseur d’identité n’a pas renvoyé de session.");
      await exchangeSession(auth.access_token);
      setPassword("");
      await onSessionChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Une erreur est survenue. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  async function submitOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/v1/user/registration/organizations", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          legalName: legalName.trim(),
          countryCode: countryCode.trim().toUpperCase(),
          defaultCurrency,
          acceptedTermsVersion: TERMS_VERSION,
        }),
      });
      const payload = await response.json().catch(() => ({})) as {
        request?: { id: string; status: string; submittedAt: string };
        error?: { message?: string };
      };
      if (!response.ok || !payload.request) {
        throw new Error(payload.error?.message ?? "La demande d’organisation n’a pas pu être soumise.");
      }
      setNotice(`Demande envoyée. Référence : ${payload.request.id}`);
      await loadRequests();
    } catch (e) {
      setError(e instanceof Error ? e.message : "La demande n’a pas pu être envoyée.");
    } finally {
      setBusy(false);
    }
  }

  async function resendConfirmation() {
    if (!user?.email) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const config = await authConfig();
      const url = new URL(`${config.supabaseUrl.replace(/\/$/, "")}/auth/v1/resend`);
      url.searchParams.set("type", "signup");
      url.searchParams.set("redirect_to", window.location.origin);
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", apikey: config.supabaseAnonKey },
        body: JSON.stringify({ email: user.email }),
      });
      if (!response.ok) throw new Error("L’e-mail ne peut pas être renvoyé pour le moment. Réessayez plus tard.");
      setNotice("Si la confirmation est encore nécessaire, un nouvel e-mail sera envoyé.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible de renvoyer l’e-mail.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    try {
      await fetch("/api/v1/user/session", { method: "DELETE", credentials: "same-origin" });
      setRequests([]);
      await onSessionChanged();
    } finally {
      setBusy(false);
    }
  }

  const pendingRequest = requests.find((request) => request.status === "PENDING");
  const rejectedRequests = requests.filter((request) => request.status === "REJECTED");

  return <main className="registration-shell">
    <section className="registration-brand">
      <div className="registration-brand-mark">Z</div>
      <p className="registration-kicker">PLATEFORME FINANCIÈRE INTERNATIONALE</p>
      <h1>ZENOX <span>FINANCE</span></h1>
      <p className="registration-intro">Votre espace professionnel pour préparer, émettre et suivre vos factures en toute sécurité.</p>
      <div className="registration-promise"><ShieldCheck size={18}/><span>Chaque organisation dispose d’un espace isolé. L’inscription ne donne pas automatiquement accès aux opérations financières.</span></div>
      <div className="registration-steps">
        <div><span>01</span><p><strong>Votre compte</strong><small>Adresse e-mail vérifiée</small></p></div>
        <div><span>02</span><p><strong>Votre organisation</strong><small>Demande d’inscription</small></p></div>
        <div><span>03</span><p><strong>Validation</strong><small>Accès après activation</small></p></div>
      </div>
    </section>

    <section className="registration-content">
      {!user && <RegistrationHomeLink />}
      <div className="registration-card">
        {user ? <>
          <div className="registration-card-top"><div className="registration-icon"><Building2 size={22}/></div><div className="registration-card-actions">{onBackToEntry && <button type="button" className="registration-signout" onClick={onBackToEntry} disabled={busy}>Autres options</button>}<button type="button" className="registration-signout" onClick={() => void signOut()} disabled={busy}>Déconnexion</button></div></div>
          {!user.emailConfirmedAt ? <>
            <p className="registration-eyebrow">CONFIRMATION REQUISE</p>
            <h2>Vérifiez votre adresse e-mail</h2>
            <p className="registration-muted">Votre compte existe, mais l’adresse e-mail doit être confirmée avant toute demande d’organisation.</p>
            {notice && <div className="registration-notice"><CheckCircle2 size={17}/><span>{notice}</span></div>}
            {error && <div className="registration-error"><CircleAlert size={17}/><span>{error}</span></div>}
            <button type="button" className="registration-primary" disabled={busy || !user.email} onClick={() => void resendConfirmation()}>
              {busy ? <LoaderCircle size={17} className="spin"/> : <Mail size={17}/>} Renvoyer l’e-mail de confirmation
            </button>
          </> : <>
          <p className="registration-eyebrow">COMPTE CONNECTÉ</p>
          <h2>Configurez votre organisation</h2>
          <p className="registration-muted">Connecté en tant que <strong>{user.email ?? "utilisateur vérifié"}</strong>. Votre compte personnel et votre organisation sont deux éléments distincts.</p>
          {notice && <div className="registration-notice"><CheckCircle2 size={17}/><span>{notice}</span></div>}
          {error && <div className="registration-error"><CircleAlert size={17}/><span>{error}</span></div>}
          {loadingRequests ? <p className="registration-muted">Chargement de vos demandes…</p> : <>
            {pendingRequest && <div className="registration-status"><span className="registration-status-dot"/><div><strong>Demande en attente de validation</strong><p>{pendingRequest.legalName} · {pendingRequest.countryCode} · {pendingRequest.defaultCurrency}</p><small>Soumise le {new Date(pendingRequest.submittedAt).toLocaleString()}</small></div></div>}
            {rejectedRequests.map((request) => <div className="registration-status rejected" key={request.id}><CircleAlert size={18}/><div><strong>Demande précédente refusée</strong><p>{request.legalName} — {request.rejectionReason ?? "Consultez les instructions communiquées par l’équipe de validation."}</p></div></div>)}
            {!pendingRequest && <form className="registration-form" onSubmit={submitOrganization}>
              <label>Raison sociale<input required minLength={2} maxLength={200} value={legalName} onChange={(event) => setLegalName(event.target.value)} placeholder="Nom légal de l’organisation"/></label>
              <div className="registration-form-grid">
                <label>Pays d’établissement<input required minLength={2} maxLength={2} pattern="[A-Za-z]{2}" value={countryCode} onChange={(event) => setCountryCode(event.target.value.toUpperCase())} placeholder="BJ"/><small>Code pays ISO 3166-1 alpha-2</small></label>
                <label>Devise par défaut<select required value={defaultCurrency} onChange={(event) => setDefaultCurrency(event.target.value)} disabled={!currencies.length}><option value="">Sélectionner</option>{currencies.map((currency) => <option key={currency.code} value={currency.code}>{currency.code} — {currency.name}</option>)}</select></label>
              </div>
              <label className="registration-consent"><input type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} required/><span>J’accepte les conditions d’utilisation et la politique de confidentialité dans leur version de travail. <strong>Les textes doivent être validés juridiquement avant une ouverture publique.</strong></span></label>
              <button className="registration-primary" type="submit" disabled={busy || !currencies.length || !acceptedTerms}>{busy ? <LoaderCircle size={17} className="spin"/> : <Building2 size={17}/>} Soumettre l’organisation</button>
              <p className="registration-footnote">La demande restera en attente. Aucun accès aux factures ou aux paiements ne sera accordé avant activation par un processus d’approbation autorisé.</p>
            </form>}
          </>}
          </>}
        </> : <>
          <div className="registration-card-top"><div className="registration-icon">{mode === "signup" ? <UserPlus size={22}/> : mode === "forgot" || mode === "reset" ? <Mail size={22}/> : <KeyRound size={22}/>}</div><span className="registration-secure"><ShieldCheck size={14}/> Connexion sécurisée</span></div>
          <p className="registration-eyebrow">{mode === "signup" ? "CRÉER UN COMPTE" : mode === "forgot" ? "RÉCUPÉRATION" : mode === "reset" ? "NOUVEAU MOT DE PASSE" : "BON RETOUR"}</p>
          <h2>{mode === "signup" ? "Rejoignez ZENOX Finance" : mode === "forgot" ? "Récupérez votre compte" : mode === "reset" ? "Définissez un nouveau mot de passe" : "Connectez-vous"}</h2>
          <p className="registration-muted">{mode === "signup" ? "Créez votre identité personnelle avant d’enregistrer votre organisation." : mode === "forgot" ? "Nous vous enverrons un lien si un compte correspond à cette adresse." : mode === "reset" ? "Choisissez un mot de passe long et unique." : "Connectez-vous pour accéder à votre espace financier."}</p>
          {notice && <div className="registration-notice"><CheckCircle2 size={17}/><span>{notice}</span></div>}
          {error && <div className="registration-error"><CircleAlert size={17}/><span>{error}</span></div>}
          <form className="registration-form" onSubmit={submitAuth}>
            {mode !== "reset" && <label>Adresse e-mail<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="vous@entreprise.com"/></label>}
            {mode === "login" || mode === "signup" ? <label>Mot de passe<input type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} required minLength={mode === "signup" ? 12 : 1} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === "signup" ? "12 caractères minimum" : "Votre mot de passe"}/></label> : null}
            {mode === "signup" && <label>Confirmer le mot de passe<input type="password" autoComplete="new-password" required minLength={12} value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} placeholder="Saisissez à nouveau le mot de passe"/></label>}
            {mode === "reset" && <label>Nouveau mot de passe<input type="password" autoComplete="new-password" required minLength={12} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="12 caractères minimum"/></label>}
            <button className="registration-primary" type="submit" disabled={busy}>{busy ? <LoaderCircle size={17} className="spin"/> : mode === "signup" ? <UserPlus size={17}/> : mode === "login" ? <LogIn size={17}/> : <KeyRound size={17}/>} {mode === "signup" ? "Créer mon compte" : mode === "forgot" ? "Envoyer le lien" : mode === "reset" ? "Changer le mot de passe" : "Se connecter"}</button>
          </form>
          <div className="registration-switches">
            {mode === "login" && <><button type="button" onClick={() => { setMode("signup"); setError(""); setNotice(""); }}>Créer un compte</button><button type="button" onClick={() => { setMode("forgot"); setError(""); setNotice(""); }}>Mot de passe oublié ?</button></>}
            {mode === "signup" && <button type="button" onClick={() => { setMode("login"); setError(""); setNotice(""); }}>Déjà inscrit ? Se connecter</button>}
            {(mode === "forgot" || mode === "reset") && <button type="button" onClick={() => { setMode("login"); setError(""); setNotice(""); }}>Retour à la connexion</button>}
          </div>
          <p className="registration-footnote">Ne partagez jamais votre mot de passe. ZENOX Finance ne vous demandera pas de communiquer votre mot de passe par e-mail.</p>
        </>}
      </div>
      <p className="registration-copyright">© 2026 ZENOX Finance · Plateforme indépendante</p>
    </section>
  </main>;
}
