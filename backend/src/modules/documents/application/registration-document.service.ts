import { createHash, randomUUID } from "node:crypto";
import { pool } from "../../../db/pool.js";
import { env } from "../../../config/env.js";

const BUCKET = "zenox-registration-documents";
const MAX_BYTES = 10 * 1024 * 1024;
const MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);
const DOCUMENT_TYPES = new Set(["BUSINESS_REGISTRATION","TAX_REGISTRATION","IDENTITY_DOCUMENT","PROOF_OF_ADDRESS","AUTHORIZATION_LETTER","OTHER"]);

export class RegistrationDocumentError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = "RegistrationDocumentError"; }
}

function hasValidSignature(contentType: string, bytes: Buffer): boolean {
  if (contentType === "application/pdf") return bytes.subarray(0, 5).toString("ascii") === "%PDF-";
  if (contentType === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (contentType === "image/png") return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
  return false;
}

async function storageRequest(path: string, init: RequestInit): Promise<Response> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new RegistrationDocumentError("DOCUMENT_STORAGE_UNAVAILABLE", "Le stockage privé des justificatifs n’est pas configuré.");
  }
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  return fetch(`${env.SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/${BUCKET}/${path}`, {
    ...init,
    headers: { apikey: key, authorization: `Bearer ${key}`, ...(init.headers ?? {}) },
  });
}

export const registrationDocumentService = {
  async list(issuer: string, subject: string, draftId: string) {
    const result = await pool.query("SELECT * FROM public.finance_list_registration_documents($1,$2,$3)", [issuer, subject, draftId]);
    return result.rows;
  },

  async upload(input: { issuer: string; subject: string; draftId: string; type: string; filename: string; contentType: string; bytes: Buffer }) {
    if (!DOCUMENT_TYPES.has(input.type)) throw new RegistrationDocumentError("INVALID_DOCUMENT_TYPE", "Type de justificatif invalide.");
    if (!MIME_TYPES.has(input.contentType)) throw new RegistrationDocumentError("UNSUPPORTED_DOCUMENT_TYPE", "Seuls les fichiers PDF, JPEG et PNG sont acceptés.");
    if (!input.bytes.length || input.bytes.length > MAX_BYTES) throw new RegistrationDocumentError("DOCUMENT_SIZE_INVALID", "Le fichier doit peser entre 1 octet et 10 Mo.");
    if (!hasValidSignature(input.contentType, input.bytes)) throw new RegistrationDocumentError("DOCUMENT_SIGNATURE_INVALID", "Le contenu du fichier ne correspond pas à son format déclaré.");
    const filename = input.filename.trim().replace(/[\\/\u0000-\u001f]/g, "_").slice(0, 180);
    if (!filename) throw new RegistrationDocumentError("INVALID_FILENAME", "Nom de fichier invalide.");

    const id = randomUUID();
    const path = `${input.draftId}/${id}`;
    const digest = createHash("sha256").update(input.bytes).digest("hex");
    const uploaded = await storageRequest(path,{method:"POST",headers:{"content-type":input.contentType,"x-upsert":"false"},body:input.bytes});
    if (!uploaded.ok) throw new RegistrationDocumentError("DOCUMENT_STORAGE_FAILED", "Le fichier n’a pas pu être stocké de manière sécurisée.");
    try {
      const saved = await pool.query("SELECT * FROM public.finance_create_registration_document($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", [id,input.draftId,input.issuer,input.subject,input.type,filename,input.contentType,input.bytes.length,digest,path]);
      if (!saved.rows[0]) throw new RegistrationDocumentError("DOCUMENT_METADATA_FAILED", "Les métadonnées du justificatif n’ont pas été enregistrées.");
      return saved.rows[0];
    } catch (error) {
      await storageRequest(path,{method:"DELETE"}).catch(()=>undefined);
      if ((error as {message?:string}).message === "REGISTRATION_DRAFT_NOT_EDITABLE") {
        throw new RegistrationDocumentError("REGISTRATION_DRAFT_NOT_EDITABLE", "Le dossier a déjà été soumis.");
      }
      throw error;
    }
  },

  async download(issuer: string, subject: string, draftId: string, documentId: string) {
    const result = await pool.query<{storage_path:string;content_type:string;original_filename:string}>("SELECT * FROM public.finance_get_registration_document($1,$2,$3,$4)", [issuer,subject,draftId,documentId]);
    const row=result.rows[0];
    if(!row) throw new RegistrationDocumentError("DOCUMENT_NOT_FOUND","Le justificatif est introuvable.");
    const response=await storageRequest(row.storage_path,{method:"GET"});
    if(!response.ok || !response.body) throw new RegistrationDocumentError("DOCUMENT_STORAGE_FAILED","Le justificatif n’est pas disponible.");
    return {body:response.body,contentType:row.content_type,filename:row.original_filename};
  },

  async remove(issuer:string,subject:string,draftId:string,documentId:string) {
    const metadata=await pool.query<{storage_path:string}>("SELECT * FROM public.finance_get_registration_document($1,$2,$3,$4)", [issuer,subject,draftId,documentId]);
    const row=metadata.rows[0];
    if(!row) throw new RegistrationDocumentError("DOCUMENT_NOT_REMOVABLE","Ce justificatif ne peut plus être supprimé.");
    const deleted=await storageRequest(row.storage_path,{method:"DELETE"});
    if(!deleted.ok && deleted.status!==404) throw new RegistrationDocumentError("DOCUMENT_STORAGE_FAILED","Le fichier n’a pas pu être supprimé.");
    const marked=await pool.query<{finance_remove_registration_document:boolean}>("SELECT public.finance_remove_registration_document($1,$2,$3,$4) AS finance_remove_registration_document", [issuer,subject,draftId,documentId]);
    if(!marked.rows[0]?.finance_remove_registration_document) throw new RegistrationDocumentError("DOCUMENT_NOT_REMOVABLE","Ce justificatif ne peut plus être supprimé.");
  },
};
