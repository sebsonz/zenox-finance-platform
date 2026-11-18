import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, RefreshCw, ShieldCheck, XCircle } from "lucide-react";

type ApiPayload<T> = { data?: T; error?: { message?: string; code?: string } };
type Assignment = {
  id:string; tenant_id:string; tenant_code:string; tenant_name:string;
  jurisdiction_code:string; jurisdiction_name:string; country_code:string;
  status:string; valid_from:string; valid_to:string|null; initiated_by:string;
  created_at:string; evidence_count:number; verified_evidence_count:number;
};
type Delegation = {
  id:string; identity_issuer:string; identity_subject:string; jurisdiction_id:string|null;
  country_code:string|null; permissions:string[]; status:string; valid_from:string;
  valid_to:string|null; reason:string;
};

async function api<T>(url:string, init?:RequestInit):Promise<T> {
  const response=await fetch(url,{credentials:"same-origin",cache:"no-store",...init,
    headers:{"Content-Type":"application/json",...(init?.headers??{})}});
  const payload=await response.json().catch(()=>({})) as ApiPayload<T>;
  if(!response.ok || payload.data===undefined) throw new Error(payload.error?.message??"L’opération n’a pas abouti.");
  return payload.data;
}

export function PlatformTaxOperations() {
  const [assignments,setAssignments]=useState<Assignment[]>([]);
  const [delegations,setDelegations]=useState<Delegation[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState("");
  const [reasons,setReasons]=useState<Record<string,string>>({});
  const [refresh,setRefresh]=useState(0);

  const load=useCallback(async()=>{
    setLoading(true);setError("");
    try {
      const [queue,delegated]=await Promise.all([
        api<Assignment[]>("/api/v1/user/platform/tax/assignments?status=PENDING_REVIEW&limit=50"),
        api<Delegation[]>("/api/v1/user/platform/tax/delegations"),
      ]);
      setAssignments(queue);setDelegations(delegated);
    } catch(e) {setError(e instanceof Error?e.message:"Impossible de charger le centre fiscal.");}
    finally {setLoading(false);}
  },[]);
  useEffect(()=>{void load();},[load,refresh]);

  async function decide(id:string,decision:"APPROVE"|"REJECT") {
    const reason=reasons[id]?.trim();
    if(decision==="REJECT" && (!reason || reason.length<10)) return;
    setBusy(id);setError("");
    try {
      await api(`/api/v1/user/platform/tax/assignments/${id}/review`,{
        method:"POST",body:JSON.stringify({decision,...(reason?{reason}:{})}),
      });
      setAssignments(items=>items.filter(item=>item.id!==id));
    } catch(e) {setError(e instanceof Error?e.message:"La décision n’a pas été enregistrée.");}
    finally {setBusy("");}
  }

  async function revoke(id:string) {
    const reason=window.prompt("Motif obligatoire de révocation (10 caractères minimum) :");
    if(!reason || reason.trim().length<10) return;
    setBusy(id);setError("");
    try {
      await api(`/api/v1/user/platform/tax/delegations/${id}/revoke`,{
        method:"POST",body:JSON.stringify({reason:reason.trim()}),
      });
      setDelegations(items=>items.map(item=>item.id===id?{...item,status:"REVOKED"}:item));
    } catch(e) {setError(e instanceof Error?e.message:"La révocation a échoué.");}
    finally {setBusy("");}
  }

  return <div className="pad-panel pta-operations">
    <div className="pad-panel-heading">
      <div><h2>Opérations fiscales</h2><p>Demandes d’affectation, décisions et délégations d’agents</p></div>
      <button className="pad-refresh-button" onClick={()=>setRefresh(v=>v+1)} disabled={loading||!!busy}><RefreshCw size={14}/> Actualiser</button>
    </div>
    {error&&<div className="pad-inline-error" role="alert"><AlertCircle size={16}/>{error}</div>}
    <div className="pad-panel-heading pta-subheading"><div><h3>Demandes en attente</h3><p>Une demande ne peut être activée sans justificatifs vérifiés et règle fiscale applicable.</p></div><span className="pad-status pending">{assignments.length} en attente</span></div>
    {loading?<div className="pad-empty-row">Chargement des dossiers fiscaux…</div>
      :assignments.length===0?<div className="pad-empty-row">Aucune demande en attente.</div>
      :<div className="pad-table-scroll"><table className="pad-table"><thead><tr><th>Organisation</th><th>Juridiction</th><th>Demande</th><th>Justificatifs</th><th>Décision</th></tr></thead><tbody>
        {assignments.map(item=><tr key={item.id}>
          <td><strong>{item.tenant_name}</strong><small>{item.tenant_code}</small></td>
          <td><strong>{item.jurisdiction_name}</strong><small>{item.country_code} · {item.jurisdiction_code}</small></td>
          <td>{item.valid_from}{item.valid_to?` → ${item.valid_to}`:" → sans échéance"}<small>Initiée par : {item.initiated_by}</small></td>
          <td>{item.verified_evidence_count}/{item.evidence_count} vérifié(s)</td>
          <td><div className="pta-decision"><button className="pad-refresh-button" disabled={!!busy} onClick={()=>void decide(item.id,"APPROVE")}><CheckCircle2 size={14}/> Approuver</button>
            <input aria-label="Motif du rejet" placeholder="Motif du rejet (10 caractères min.)" value={reasons[item.id]??""} onChange={e=>setReasons(v=>({...v,[item.id]:e.target.value}))}/>
            <button className="pad-refresh-button" disabled={!!busy||(reasons[item.id]?.trim().length??0)<10} onClick={()=>void decide(item.id,"REJECT")}><XCircle size={14}/> Rejeter</button></div></td>
        </tr>)}
      </tbody></table></div>}
    <div className="pad-panel-heading pta-subheading"><div><h3>Délégations fiscales</h3><p>Les agents sont limités aux opérations et périmètres autorisés.</p></div><ShieldCheck size={18}/></div>
    {loading?<div className="pad-empty-row">Chargement des délégations…</div>
      :delegations.length===0?<div className="pad-empty-row">Aucune délégation enregistrée.</div>
      :<div className="pad-table-scroll"><table className="pad-table"><thead><tr><th>Agent</th><th>Périmètre</th><th>Permissions</th><th>Validité</th><th>Statut</th><th></th></tr></thead><tbody>
        {delegations.map(item=><tr key={item.id}>
          <td><strong>{item.identity_subject}</strong><small>{item.identity_issuer}</small></td>
          <td>{item.country_code??item.jurisdiction_id??"—"}</td>
          <td>{item.permissions.join(", ")}</td>
          <td>{new Date(item.valid_from).toLocaleDateString()} · {item.valid_to?new Date(item.valid_to).toLocaleDateString():"sans échéance"}</td>
          <td><span className={`pad-status ${item.status.toLowerCase()}`}>{item.status}</span></td>
          <td>{item.status==="ACTIVE"&&<button className="pad-refresh-button" disabled={!!busy} onClick={()=>void revoke(item.id)}>Révoquer</button>}</td>
        </tr>)}
      </tbody></table></div>}
  </div>;
}
