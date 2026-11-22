import { useEffect, useMemo, useState } from "react";
import { RefreshCw, ShieldCheck, UserPlus, Save } from "lucide-react";

type Identity = { identity_subject: string; email: string | null; account_status: string };
type Member = {
  identity_issuer: string; identity_subject: string; role_code: string; status: string;
  created_at: string; updated_at: string;
};
type Role = "PLATFORM_ADMIN" | "PLATFORM_SECURITY_ADMIN" | "PLATFORM_ORGANIZATION_ADMIN" | "PLATFORM_TAX_ADMIN" | "PLATFORM_SUPPORT_READONLY";
type Payload<T> = { data?: T; error?: { message?: string } };
const roles: { value: Role; label: string; detail: string }[] = [
  { value: "PLATFORM_ADMIN", label: "Super Admin", detail: "Tous les droits plateforme" },
  { value: "PLATFORM_SECURITY_ADMIN", label: "Administrateur sécurité", detail: "Identités, opérateurs et audit" },
  { value: "PLATFORM_ORGANIZATION_ADMIN", label: "Administrateur organisations", detail: "Organisations et inscriptions" },
  { value: "PLATFORM_TAX_ADMIN", label: "Administrateur fiscal", detail: "Référentiel fiscal et juridictions" },
  { value: "PLATFORM_SUPPORT_READONLY", label: "Support lecture seule", detail: "Consultation limitée, sans modification" },
];

async function payload<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as Payload<T>;
  if (!response.ok || body.data === undefined) throw new Error(body.error?.message ?? "Une erreur est survenue.");
  return body.data;
}

export function PlatformMembershipWorkspace() {
  const [members, setMembers] = useState<Member[]>([]);
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [subject, setSubject] = useState("");
  const [role, setRole] = useState<Role>("PLATFORM_SUPPORT_READONLY");
  const [status, setStatus] = useState<"ACTIVE" | "SUSPENDED">("ACTIVE");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = async () => {
    setLoading(true); setError("");
    try {
      const [memberResponse, identityResponse] = await Promise.all([
        fetch("/api/v1/user/platform/members", { credentials: "same-origin", cache: "no-store" }),
        fetch("/api/v1/user/platform/users?page=1&pageSize=100&status=ACTIVE", { credentials: "same-origin", cache: "no-store" }),
      ]);
      const [memberData, identityData] = await Promise.all([
        payload<{ items: Member[] }>(memberResponse),
        payload<{ items: Identity[] }>(identityResponse),
      ]);
      setMembers(memberData.items ?? []);
      setIdentities(identityData.items ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : "Chargement impossible."); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);
  const eligible = useMemo(() => identities.filter((identity) => identity.account_status === "ACTIVE"), [identities]);

  const save = async () => {
    if (!subject || reason.trim().length < 10) return;
    const response = await fetch("/api/v1/user/platform/members", {
      method: "PUT", credentials: "same-origin", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetSubject: subject, roleCode: role, status, reason: reason.trim() }),
    });
    const body = await response.json().catch(() => ({})) as Payload<{ updated: boolean }>;
    if (!response.ok) { setError(body.error?.message ?? "La modification a échoué."); return; }
    setNotice("Habilitation enregistrée et journalisée.");
    setSubject(""); setReason("");
    await load();
  };

  return <section className="pad-module-page">
    <div className="pad-module-intro">
      <div className="pad-placeholder-icon"><ShieldCheck size={25}/></div>
      <div><span className="pad-source-label">Habilitations contrôlées · auditées</span><h2>Opérateurs & rôles plateforme</h2>
        <p>Attribuez uniquement les droits nécessaires. Les appartenances aux organisations et les délégations fiscales restent indépendantes.</p></div>
      <button className="pad-refresh-button" onClick={() => void load()} disabled={loading}><RefreshCw size={14}/> Actualiser</button>
    </div>
    {error && <div className="pad-inline-error" role="alert">{error}</div>}
    {notice && <div className="pad-module-note"><ShieldCheck size={17}/><p>{notice}</p></div>}
    <div className="pad-panel" style={{ padding: 20, marginBottom: 18 }}>
      <div className="pad-panel-heading"><div><h2><UserPlus size={16}/> Attribuer ou modifier un accès plateforme</h2><p>Choisissez une identité existante pour créer ou modifier son habilitation.</p></div></div>
      <div className="pad-feature-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))" }}>
        <label className="pad-form-field">Identité
          <select value={subject} onChange={(e) => {
            const next = e.target.value;
            setSubject(next);
            const existing = members.find((item) => item.identity_subject === next);
            if (existing) {
              setRole(existing.role_code as Role);
              setStatus(existing.status as "ACTIVE" | "SUSPENDED");
            } else {
              setRole("PLATFORM_SUPPORT_READONLY");
              setStatus("ACTIVE");
            }
          }}>
            <option value="">Sélectionner un utilisateur…</option>
            {eligible.map((item) => <option key={item.identity_subject} value={item.identity_subject}>{item.email ?? item.identity_subject}{members.some((member) => member.identity_subject === item.identity_subject) ? " · Opérateur" : ""}</option>)}
          </select>
        </label>
        <label className="pad-form-field">Rôle
          <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {roles.map((item) => <option key={item.value} value={item.value}>{item.label} — {item.detail}</option>)}
          </select>
        </label>
        <label className="pad-form-field">Statut
          <select value={status} onChange={(e) => setStatus(e.target.value as "ACTIVE" | "SUSPENDED")}>
            <option value="ACTIVE">Actif</option><option value="SUSPENDED">Suspendu</option>
          </select>
        </label>
        <label className="pad-form-field">Motif obligatoire
          <input value={reason} onChange={(e) => setReason(e.target.value)} minLength={10} maxLength={1000} placeholder="Justification (10 à 1000 caractères)"/>
        </label>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
        <button className="pad-refresh-button" onClick={() => void save()} disabled={saving || !subject || reason.trim().length < 10}><Save size={14}/> Enregistrer l'habilitation</button>
      </div>
      <small className="pad-field-hint">L’attribution du rôle Super Admin, des rôles fiscaux et organisationnels est réservée au Super Admin.</small>
    </div>
    <section className="pad-panel">
      <div className="pad-panel-heading"><div><h2>Opérateurs enregistrés</h2><p>{members.length} habilitation(s) plateforme</p></div><span className="pad-source-label">Source SQL sécurisée</span></div>
      {loading ? <div className="pad-empty-row">Chargement…</div> : members.length === 0 ? <div className="pad-empty-row">Aucun opérateur enregistré.</div> :
        <div className="pad-table-scroll"><table className="pad-table"><thead><tr><th>Identité</th><th>Rôle</th><th>Statut</th><th>Créé le</th></tr></thead>
          <tbody>{members.map((member) => <tr key={member.identity_issuer + member.identity_subject}>
            <td><strong>{identities.find((item) => item.identity_subject === member.identity_subject)?.email ?? member.identity_subject}</strong><small>{member.identity_subject}</small></td>
            <td>{roles.find((item) => item.value === member.role_code)?.label ?? member.role_code}</td>
            <td><span className={`pad-status ${member.status.toLowerCase()}`}>{member.status === "ACTIVE" ? "Actif" : "Suspendu"}</span></td>
            <td>{new Date(member.created_at).toLocaleDateString("fr-FR")}</td>
          </tr>)}</tbody></table></div>}
    </section>
  </section>;
}
