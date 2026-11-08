import { useEffect, useState } from "react";
import { ArrowLeft, Building2, ChevronRight, RefreshCw, Save, ShieldAlert, Users } from "lucide-react";
import "./PlatformOrganizationsWorkspace.css";

type Organization = { id:string; tenantCode:string; legalName:string; countryCode:string; defaultCurrency:string; status:"PENDING"|"ACTIVE"|"SUSPENDED"|"DISABLED"; createdAt:string };
type Member = { id:string; identityIssuer:string; identitySubject:string; role:"OWNER"|"ADMIN"|"FINANCE_MANAGER"|"FINANCE_OPERATOR"|"VIEWER"; status:"PENDING"|"ACTIVE"|"SUSPENDED"|"REVOKED"; activatedAt:string|null; createdAt:string };
type Address = { id:string; addressType:string; label:string|null; addressLine1:string; addressLine2:string|null; city:string; region:string|null; countryCode:string; isPrimary:boolean; status:string; validFrom:string };
type Dossier = Organization & { updatedAt:string; profile:{tradeName:string|null;timezone:string;primaryLanguage:string;supportedLanguages:string[];websiteUrl:string|null;generalEmail:string|null;generalPhone:string|null}; addresses:Address[]; members:Member[] };
type Draft = { tradeName:string; timezone:string; primaryLanguage:string; supportedLanguages:string; websiteUrl:string; generalEmail:string; generalPhone:string; reason:string };
type Payload<T> = {data?:T;error?:{message?:string}};
async function readData<T>(r:Response,fallback:string):Promise<T>{const p=await r.json().catch(()=>({})) as Payload<T>;if(!r.ok||p.data===undefined)throw new Error(p.error?.message??fallback);return p.data;}
const statusLabel=(s:string)=>({ACTIVE:"Active",PENDING:"En attente",SUSPENDED:"Suspendue",DISABLED:"Désactivée",REVOKED:"Révoqué",OWNER:"Propriétaire",ADMIN:"Administrateur",FINANCE_MANAGER:"Responsable finance",FINANCE_OPERATOR:"Opérateur finance",VIEWER:"Lecteur"} as Record<string,string>)[s]??s;
const dateLabel=(v:string|null|undefined)=>v?new Date(v).toLocaleDateString("fr-FR",{day:"2-digit",month:"short",year:"numeric"}):"—";
const makeDraft=(d:Dossier):Draft=>({tradeName:d.profile.tradeName??"",timezone:d.profile.timezone||"UTC",primaryLanguage:d.profile.primaryLanguage||"fr",supportedLanguages:(d.profile.supportedLanguages??["fr"]).join(", "),websiteUrl:d.profile.websiteUrl??"",generalEmail:d.profile.generalEmail??"",generalPhone:d.profile.generalPhone??"",reason:""});

export function PlatformOrganizationsWorkspace({organizations,total,loading,error,statusFilter,setStatusFilter,onRefresh}:{organizations:Organization[];total:number;loading:boolean;error:string;statusFilter:string;setStatusFilter:(v:string)=>void;onRefresh:()=>void}){
 const [selectedId,setSelectedId]=useState<string|null>(null),[dossier,setDossier]=useState<Dossier|null>(null),[draft,setDraft]=useState<Draft|null>(null);
 const [busy,setBusy]=useState(false),[detailError,setDetailError]=useState(""),[actionError,setActionError]=useState(""),[notice,setNotice]=useState("");
 const [lifecycleReason,setLifecycleReason]=useState("");
 const [memberDrafts,setMemberDrafts]=useState<Record<string,{role:Member["role"];status:Member["status"];reason:string}>>({});
 async function open(id:string){setSelectedId(id);setBusy(true);setDetailError("");setActionError("");setNotice("");try{const r=await fetch("/api/v1/user/platform/organizations/"+id,{credentials:"same-origin",cache:"no-store"});const d=await readData<{organization:Dossier}>(r,"Impossible de charger le dossier.");setDossier(d.organization);setDraft(makeDraft(d.organization));setMemberDrafts(Object.fromEntries(d.organization.members.map(m=>[m.id,{role:m.role,status:m.status,reason:""}])));}catch(e){setDossier(null);setDraft(null);setDetailError(e instanceof Error?e.message:"Erreur de chargement.");}finally{setBusy(false);}}
 async function saveProfile(){if(!selectedId||!draft)return;setBusy(true);setActionError("");try{const r=await fetch("/api/v1/user/platform/organizations/"+selectedId+"/profile",{method:"PATCH",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({...draft,tradeName:draft.tradeName.trim()||null,supportedLanguages:draft.supportedLanguages.split(",").map(x=>x.trim()).filter(Boolean),websiteUrl:draft.websiteUrl.trim()||null,generalEmail:draft.generalEmail.trim()||null,generalPhone:draft.generalPhone.trim()||null})});await readData(r,"Impossible d’enregistrer le profil.");await open(selectedId);setNotice("Profil mis à jour et opération journalisée.");onRefresh();}catch(e){setActionError(e instanceof Error?e.message:"Échec de la mise à jour.");}finally{setBusy(false);}}
 async function lifecycle(action:"SUSPEND"|"REACTIVATE"){if(!selectedId||lifecycleReason.trim().length<10)return;setBusy(true);setActionError("");try{const r=await fetch("/api/v1/user/platform/organizations/"+selectedId+"/status",{method:"PATCH",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,reason:lifecycleReason.trim()})});await readData(r,"Impossible de modifier le statut.");setLifecycleReason("");await open(selectedId);setNotice(action==="SUSPEND"?"Organisation suspendue.":"Organisation réactivée.");onRefresh();}catch(e){setActionError(e instanceof Error?e.message:"Échec de l’opération.");}finally{setBusy(false);}}
 async function saveMember(id:string){if(!selectedId)return;const m=memberDrafts[id];if(!m)return;setBusy(true);setActionError("");try{const r=await fetch("/api/v1/user/platform/organizations/"+selectedId+"/members/"+id,{method:"PATCH",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify(m)});await readData(r,"Impossible de modifier le membre.");await open(selectedId);setNotice("Habilitations du membre mises à jour.");}catch(e){setActionError(e instanceof Error?e.message:"Échec de la mise à jour.");}finally{setBusy(false);}}
 useEffect(()=>{if(selectedId&&!organizations.some(o=>o.id===selectedId)){setSelectedId(null);setDossier(null);setDraft(null);}},[organizations,selectedId]);
 if(selectedId)return <section className="poa-workspace">
  <button className="poa-back" onClick={()=>{setSelectedId(null);setDossier(null);setDraft(null);setActionError("");setNotice("");}}><ArrowLeft size={15}/> Retour au répertoire</button>
  {busy&&!dossier&&<div className="poa-state">Chargement du dossier…</div>}{detailError&&<div className="poa-error">{detailError}<button onClick={()=>void open(selectedId)}>Réessayer</button></div>}
  {actionError&&<div className="poa-error">{actionError}</div>}{notice&&<div className="poa-success">{notice}</div>}
  {dossier&&draft&&<>
   <header className="poa-head"><span className="poa-icon"><Building2 size={23}/></span><div><small>DOSSIER ORGANISATION · {dossier.tenantCode}</small><h2>{dossier.legalName}</h2><p>{dossier.countryCode} · {dossier.defaultCurrency} · Créée le {dateLabel(dossier.createdAt)}</p></div><b className={"poa-status "+dossier.status.toLowerCase()}>{statusLabel(dossier.status)}</b></header>
   <div className="poa-grid">
    <section className="poa-card"><div className="poa-card-title"><div><h3>Profil et coordonnées</h3><p>Informations opérationnelles modifiables</p></div><Save size={17}/></div>
     <div className="poa-fields">
      <label>Nom commercial<input value={draft.tradeName} onChange={e=>setDraft({...draft,tradeName:e.target.value})}/></label>
      <label>Site web<input value={draft.websiteUrl} onChange={e=>setDraft({...draft,websiteUrl:e.target.value})} placeholder="https://…"/></label>
      <label>E-mail professionnel<input type="email" value={draft.generalEmail} onChange={e=>setDraft({...draft,generalEmail:e.target.value})}/></label>
      <label>Téléphone<input value={draft.generalPhone} onChange={e=>setDraft({...draft,generalPhone:e.target.value})}/></label>
      <label>Fuseau horaire<input value={draft.timezone} onChange={e=>setDraft({...draft,timezone:e.target.value})}/></label>
      <label>Langue principale<input value={draft.primaryLanguage} onChange={e=>setDraft({...draft,primaryLanguage:e.target.value})}/></label>
      <label className="poa-wide">Langues prises en charge<input value={draft.supportedLanguages} onChange={e=>setDraft({...draft,supportedLanguages:e.target.value})} placeholder="fr, en"/></label>
      <label className="poa-wide">Motif obligatoire<textarea value={draft.reason} onChange={e=>setDraft({...draft,reason:e.target.value})} placeholder="Justification (10 caractères minimum)"/></label>
     </div><div className="poa-actions"><button className="poa-primary" disabled={busy||draft.reason.trim().length<10} onClick={()=>void saveProfile()}><Save size={14}/> Enregistrer le profil</button></div>
    </section>
    <section className="poa-card"><div className="poa-card-title"><div><h3>Cycle de vie</h3><p>Opérations sensibles avec motif et audit</p></div><ShieldAlert size={17}/></div>
     <p className="poa-copy">Statut actuel : <strong>{statusLabel(dossier.status)}</strong></p>
     <label className="poa-label">Motif de l’opération<textarea value={lifecycleReason} onChange={e=>setLifecycleReason(e.target.value)} placeholder="Motif obligatoire (10 caractères minimum)"/></label>
     {dossier.status==="ACTIVE"&&<button className="poa-danger" disabled={busy||lifecycleReason.trim().length<10} onClick={()=>void lifecycle("SUSPEND")}>Suspendre l’organisation</button>}
     {dossier.status==="SUSPENDED"&&<button className="poa-primary" disabled={busy||lifecycleReason.trim().length<10} onClick={()=>void lifecycle("REACTIVATE")}>Réactiver l’organisation</button>}
     {["PENDING","DISABLED"].includes(dossier.status)&&<p className="poa-muted">Ce statut doit être traité par le workflow d’inscription ou une procédure dédiée.</p>}
    </section>
   </div>
   <section className="poa-card"><div className="poa-card-title"><div><h3><Users size={17}/> Membres et habilitations</h3><p>{dossier.members.length} membre(s) · Identifiants d’identité sans données de connexion</p></div></div>
    {dossier.members.length===0?<div className="poa-state">Aucun membre enregistré.</div>:dossier.members.map(m=>{const v=memberDrafts[m.id]??{role:m.role,status:m.status,reason:""};return <article className="poa-member" key={m.id}>
     <div className="poa-member-id"><strong>{m.identitySubject.slice(0,8)}…{m.identitySubject.slice(-4)}</strong><small>{m.identityIssuer}</small><span>{statusLabel(m.role)} · {statusLabel(m.status)}</span></div>
     <div className="poa-member-controls">
      <label>Rôle<select value={v.role} onChange={e=>setMemberDrafts({...memberDrafts,[m.id]:{...v,role:e.target.value as Member["role"]}})}>{(["OWNER","ADMIN","FINANCE_MANAGER","FINANCE_OPERATOR","VIEWER"] as const).map(x=><option key={x} value={x}>{statusLabel(x)}</option>)}</select></label>
      <label>Statut<select value={v.status} onChange={e=>setMemberDrafts({...memberDrafts,[m.id]:{...v,status:e.target.value as Member["status"]}})}>{(["PENDING","ACTIVE","SUSPENDED","REVOKED"] as const).map(x=><option key={x} value={x}>{statusLabel(x)}</option>)}</select></label>
      <label>Motif<input value={v.reason} onChange={e=>setMemberDrafts({...memberDrafts,[m.id]:{...v,reason:e.target.value}})} placeholder="Justification obligatoire"/></label>
      <button className="poa-secondary" disabled={busy||v.reason.trim().length<10||(v.role===m.role&&v.status===m.status)} onClick={()=>void saveMember(m.id)}>Appliquer</button>
     </div></article>;})}
   </section>
   <section className="poa-card"><div className="poa-card-title"><div><h3>Adresses enregistrées</h3><p>Informations du dossier de l’organisation</p></div></div>
    {dossier.addresses.length===0?<div className="poa-state">Aucune adresse enregistrée.</div>:<div className="poa-addresses">{dossier.addresses.map(a=><article key={a.id}><strong>{a.label??a.addressType}{a.isPrimary?" · Principale":""}</strong><span>{a.addressLine1}{a.addressLine2?", "+a.addressLine2:""}, {a.city}{a.region?", "+a.region:""}, {a.countryCode}</span><small>{a.status} · Depuis le {dateLabel(a.validFrom)}</small></article>)}</div>}
   </section>
  </>}
 </section>;
 return <section className="pad-module">
  <div className="pad-module-tools"><div><h2>Répertoire global</h2><p>{total} organisation(s) · Gestion Super Admin.</p></div><div className="pad-module-actions"><span className="pad-source-label">API sécurisée · Actions journalisées</span><button className="pad-refresh-button" onClick={onRefresh} disabled={loading}><RefreshCw size={14}/> Actualiser</button></div></div>
  <div className="pad-filterbar"><label>Statut <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="ALL">Tous les statuts</option><option value="ACTIVE">Active</option><option value="PENDING">En attente</option><option value="SUSPENDED">Suspendue</option><option value="DISABLED">Désactivée</option></select></label><span>{organizations.length} résultat(s)</span></div>
  {error?<div className="pad-inline-error">{error}<button className="pad-refresh-button" onClick={onRefresh}>Réessayer</button></div>:loading?<div className="pad-empty-row">Chargement des organisations…</div>:organizations.length===0?<div className="pad-empty-row">Aucune organisation ne correspond aux filtres.</div>:<div className="pad-table-scroll"><table className="pad-table"><thead><tr><th>Organisation</th><th>Code</th><th>Pays</th><th>Devise</th><th>Statut</th><th>Créée le</th><th>Action</th></tr></thead><tbody>{organizations.map(o=><tr key={o.id}><td><strong>{o.legalName}</strong><small>{o.id}</small></td><td>{o.tenantCode}</td><td>{o.countryCode}</td><td>{o.defaultCurrency}</td><td><span className={"poa-status "+o.status.toLowerCase()}>{statusLabel(o.status)}</span></td><td>{dateLabel(o.createdAt)}</td><td><button className="poa-open" onClick={()=>void open(o.id)}>Ouvrir le dossier <ChevronRight size={14}/></button></td></tr>)}</tbody></table></div>}
 </section>;
}
