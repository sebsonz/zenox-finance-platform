import { useState } from "react";
import { ArrowRight, Building2, CircleAlert, LoaderCircle, LogOut, RefreshCw, ShieldCheck } from "lucide-react";
import "./PlatformEntryWorkspace.css";

type User = { id: string; email?: string; emailConfirmedAt?: string | null };
type Props = {
  user: User;
  onCreateOrganization: () => void;
  onSessionChanged: () => Promise<void>;
};
type ApiPayload = { data?: { isPlatformOperator?: boolean }; error?: { code?: string; message?: string } };

export function PlatformEntryWorkspace({ user, onCreateOrganization, onSessionChanged }: Props) {
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function openPlatformAccess() {
    setChecking(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/v1/user/platform/me", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({})) as ApiPayload;
      if (response.ok && payload.data?.isPlatformOperator === true) {
        await onSessionChanged();
        return;
      }
      if (response.status === 403) {
        setNotice("L’accès administrateur n’est pas encore activé pour cette identité. Aucune organisation cliente n’est nécessaire pour devenir administrateur. L’activation doit être réalisée par un DBA autorisé après vérification de l’identité Supabase.");
        return;
      }
      if (response.status === 401) {
        setError("Votre session n’est plus valide. Déconnectez-vous puis reconnectez-vous.");
        return;
      }
      setError(payload.error?.message ?? "Impossible de vérifier l’accès à la plateforme. Réessayez.");
    } catch {
      setError("L’API Finance est momentanément inaccessible. Votre rôle n’a pas été modifié.");
    } finally {
      setChecking(false);
    }
  }

  async function signOut() {
    setChecking(true);
    setError("");
    try {
      await fetch("/api/v1/user/session", {
        method: "DELETE",
        credentials: "same-origin",
      });
      await onSessionChanged();
    } catch {
      setError("La déconnexion n’a pas pu être confirmée. Réessayez.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <main className="platform-entry-shell">
      <section className="platform-entry-brand" aria-label="ZENOX Finance">
        <div className="platform-entry-brand-mark">Z</div>
        <p className="platform-entry-kicker">PLATEFORME FINANCIÈRE INTERNATIONALE</p>
        <h1>ZENOX <span>FINANCE</span></h1>
        <p className="platform-entry-intro">Un point d’entrée unique pour les organisations clientes et l’administration de la plateforme.</p>
        <div className="platform-entry-security"><ShieldCheck size={19}/><span>Les droits administrateur sont vérifiés côté serveur. Une adresse e-mail ou une action dans le navigateur ne suffit jamais à accorder des privilèges.</span></div>
      </section>

      <section className="platform-entry-content">
        <article className="platform-entry-card">
          <div className="platform-entry-card-icon"><ShieldCheck size={23}/></div>
          <p className="platform-entry-eyebrow">COMPTE PERSONNEL CONNECTÉ</p>
          <h2>Choisissez votre espace</h2>
          <p className="platform-entry-muted">Connecté en tant que <strong>{user.email ?? "utilisateur vérifié"}</strong>. Votre compte personnel peut accéder à l’administration de la plateforme ou demander un espace d’organisation selon les droits qui lui sont attribués.</p>

          {notice && <div className="platform-entry-notice" role="status"><CircleAlert size={18}/><span>{notice}</span></div>}
          {error && <div className="platform-entry-error" role="alert"><CircleAlert size={18}/><span>{error}</span></div>}

          <button type="button" className="platform-entry-primary" onClick={() => void openPlatformAccess()} disabled={checking || !user.emailConfirmedAt}>
            {checking ? <LoaderCircle size={18} className="platform-entry-spin"/> : <ShieldCheck size={18}/>}
            <span>Accéder à l’administration</span><ArrowRight size={17}/>
          </button>
          {!user.emailConfirmedAt && <p className="platform-entry-hint">Confirmez votre adresse e-mail avant de vérifier les accès à la plateforme.</p>}

          <div className="platform-entry-divider"><span>OU</span></div>

          <button type="button" className="platform-entry-secondary" onClick={onCreateOrganization} disabled={checking}>
            <Building2 size={18}/><span>Créer ou suivre une organisation cliente</span><ArrowRight size={17}/>
          </button>
          <p className="platform-entry-hint">Cette option ouvre le parcours client pour créer une demande ou consulter son état. Elle n’est pas requise pour un compte administrateur.</p>

          <button type="button" className="platform-entry-signout" onClick={() => void signOut()} disabled={checking}>
            <LogOut size={16}/> Déconnexion
          </button>
          <button type="button" className="platform-entry-retry" onClick={() => void onSessionChanged()} disabled={checking}>
            <RefreshCw size={14}/> Actualiser les droits
          </button>
        </article>
      </section>
    </main>
  );
}
