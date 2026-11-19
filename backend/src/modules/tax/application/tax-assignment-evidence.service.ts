import { createHash, randomUUID } from "node:crypto";
import { pool } from "../../../db/pool.js";
import { env } from "../../../config/env.js";

// Reuse the existing private registration-document bucket as approved for tax evidence.
const BUCKET="zenox-registration-documents";
const MAX_BYTES=10*1024*1024;
const MIME_TYPES=new Set(["application/pdf","image/jpeg","image/png"]);
const DOCUMENT_TYPES=new Set(["TAX_REGISTRATION","BUSINESS_REGISTRATION","PROOF_OF_ADDRESS","AUTHORIZATION_LETTER","OTHER"]);

export class TaxAssignmentEvidenceError extends Error {
  constructor(readonly code:string,message:string){super(message);this.name="TaxAssignmentEvidenceError";}
}
function validSignature(type:string,bytes:Buffer):boolean {
  if(type==="application/pdf")return bytes.subarray(0,5).toString("ascii")==="%PDF-";
  if(type==="image/jpeg")return bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;
  if(type==="image/png")return bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
  return false;
}
async function storage(path:string,init:RequestInit):Promise<Response>{
  if(!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY)
    throw new TaxAssignmentEvidenceError("DOCUMENT_STORAGE_UNAVAILABLE","Le stockage privé des justificatifs fiscaux n’est pas configuré.");
  const key=env.SUPABASE_SERVICE_ROLE_KEY;
  return fetch(`${env.SUPABASE_URL.replace(/\/$/,"")}/storage/v1/object/${BUCKET}/${path}`,{
    ...init,headers:{apikey:key,authorization:`Bearer ${key}`,...(init.headers??{})},
  });
}
export const taxAssignmentEvidenceService={
  async upload(input:{
    assignmentId:string;tenantId:string;issuer:string;subject:string;correlationId:string;
    type:string;filename:string;contentType:string;bytes:Buffer;
  }){
    if(!DOCUMENT_TYPES.has(input.type))throw new TaxAssignmentEvidenceError("INVALID_DOCUMENT_TYPE","Type de justificatif fiscal invalide.");
    if(!MIME_TYPES.has(input.contentType))throw new TaxAssignmentEvidenceError("UNSUPPORTED_DOCUMENT_TYPE","Seuls PDF, JPEG et PNG sont acceptés.");
    if(!input.bytes.length||input.bytes.length>MAX_BYTES)throw new TaxAssignmentEvidenceError("DOCUMENT_SIZE_INVALID","Le fichier doit peser entre 1 octet et 10 Mo.");
    if(!validSignature(input.contentType,input.bytes))throw new TaxAssignmentEvidenceError("DOCUMENT_SIGNATURE_INVALID","Le contenu ne correspond pas au format déclaré.");
    const filename=input.filename.trim().replace(/[\\/\u0000-\u001f]/g,"_").slice(0,180);
    if(!filename)throw new TaxAssignmentEvidenceError("INVALID_FILENAME","Nom de fichier invalide.");
    const id=randomUUID();
    const path=`${input.assignmentId}/${id}`;
    const digest=createHash("sha256").update(input.bytes).digest("hex");
    const body=Uint8Array.from(input.bytes);
    const uploaded=await storage(path,{method:"POST",headers:{"content-type":input.contentType,"x-upsert":"false"},body});
    if(!uploaded.ok)throw new TaxAssignmentEvidenceError("DOCUMENT_STORAGE_FAILED","Le fichier n’a pas pu être stocké.");
    try{
      const saved=await pool.query(
        "SELECT public.finance_add_tax_assignment_evidence($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) AS id",
        [input.assignmentId,input.tenantId,input.type,filename,input.contentType,input.bytes.length,
         digest,path,input.issuer,input.subject,input.correlationId],
      );
      if(!saved.rows[0]?.id)throw new TaxAssignmentEvidenceError("DOCUMENT_METADATA_FAILED","Les métadonnées du justificatif n’ont pas été enregistrées.");
      return {id:saved.rows[0].id,documentType:input.type,filename,contentType:input.contentType,
        byteSize:input.bytes.length,sha256:digest,status:"UPLOADED"};
    }catch(error){
      await storage(path,{method:"DELETE"}).catch(()=>undefined);
      const code=(error as {message?:string}).message;
      if(code==="TAX_ASSIGNMENT_NOT_EDITABLE")throw new TaxAssignmentEvidenceError(code,"La demande fiscale n’est plus modifiable.");
      throw error;
    }
  },
  async download(evidenceId:string,tenantId:string,issuer:string,subject:string){
    const result=await pool.query<{storage_path:string;content_type:string;original_filename:string}>(
      "SELECT * FROM public.finance_get_tax_assignment_evidence_content($1,$2,$3,$4)",[evidenceId,tenantId,issuer,subject],
    );
    const row=result.rows[0];
    if(!row)throw new TaxAssignmentEvidenceError("TAX_EVIDENCE_NOT_FOUND","Le justificatif fiscal est introuvable.");
    const response=await storage(row.storage_path,{method:"GET"});
    if(!response.ok||!response.body)throw new TaxAssignmentEvidenceError("DOCUMENT_STORAGE_FAILED","Le justificatif fiscal n’est pas disponible.");
    return {body:response.body,contentType:row.content_type,filename:row.original_filename};
  },
};
