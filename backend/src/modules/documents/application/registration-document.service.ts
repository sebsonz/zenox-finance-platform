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
    const result = await pool.query(
      `SELECT d.id, d.document_type, d.original_filename, d.content_type, d.byte_size, d.sha256, d.status, d.created_at
         FROM public.finance_registration_documents d
         JOIN public.finance_registration_drafts r ON r.id=d.draft_id
        WHERE d.draft_id=$1 AND r.identity_issuer=$2 AND r.identity_subject=$3
          AND d.identity_issuer=$2 AND d.identity_subject=$3 AND d.status <> 'REMOVED'
        ORDER BY d.created_at,d.id`,
      [draftId, issuer, subject],
    );
    return result.rows;
  },

  async upload(input: { issuer: string; subject: string; draftId: string; type: string; filename: string; contentType: string; bytes: Buffer }) {
    if (!DOCUMENT_TYPES.has(input.type)) throw new RegistrationDocumentError("INVALID_DOCUMENT_TYPE", "Type de justificatif invalide.");
    if (!MIME_TYPES.has(input.contentType)) throw new RegistrationDocumentError("UNSUPPORTED_DOCUMENT_TYPE", "Seuls les fichiers PDF, JPEG et PNG sont acceptés.");
    if (!input.bytes.length || input.bytes.length > MAX_BYTES) throw new RegistrationDocumentError("DOCUMENT_SIZE_INVALID", "Le fichier doit peser entre 1 octet et 10 Mo.");
    const filename = input.filename.trim().replace(/[\\/\u0000-\u001f]/g, "_").slice(0, 180);
    if (!filename) throw new RegistrationDocumentError("INVALID_FILENAME", "Nom de fichier invalide.");
    const draft = await pool.query<{status:string}>(
      "SELECT status FROM public.finance_registration_drafts WHERE id=$1 AND identity_issuer=$2 AND identity_subject=$3",
      [input.draftId,input.issuer,input.subject],
    );
    if (!draft.rows[0]) throw new RegistrationDocumentError("REGISTRATION_DRAFT_NOT_FOUND","Le brouillon est introuvable.");
    if (draft.rows[0].status !== "DRAFT") throw new RegistrationDocumentError("REGISTRATION_DRAFT_NOT_EDITABLE","Le dossier a déjà été soumis.");

    const id = randomUUID();
    const path = `${input.draftId}/${id}`;
    const digest = createHash("sha256").update(input.bytes).digest("hex");
    const uploaded = await storageRequest(path,{method:"POST",headers:{"content-type":input.contentType,"x-upsert":"false","cache-control":"private, max-age=0"},body:input.bytes});
    if (!uploaded.ok) throw new RegistrationDocumentError("DOCUMENT_STORAGE_FAILED","Le fichier n’a pas pu être stocké de manière sécurisée.");
    try {
      const saved = await pool.query(
        `INSERT INTO public.finance_registration_documents
          (id,draft_id,identity_issuer,identity_subject,document_type,original_filename,content_type,byte_size,sha256,storage_path)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING id,document_type,original_filename,content_type,byte_size,sha256,status,created_at`,
        [id,input.draftId,input.issuer,input.subject,input.type,filename,input.contentType,input.bytes.length,digest,path],
      );
      return saved.rows[0];
    } catch (error) {
      await storageRequest(path,{method:"DELETE"}).catch(()=>undefined);
      throw error;
    }
  },

  async download(issuer: string, subject: string, draftId: string, documentId: string) {
    const result = await pool.query<{storage_path:string;content_type:string;original_filename:string}>(
      `SELECT d.storage_path,d.content_type,d.original_filename
         FROM public.finance_registration_documents d JOIN public.finance_registration_drafts r ON r.id=d.draft_id
        WHERE d.id=$1 AND d.draft_id=$2 AND d.identity_issuer=$3 AND d.identity_subject=$4
          AND r.identity_issuer=$3 AND r.identity_subject=$4 AND d.status <> 'REMOVED'`,
      [documentId,draftId,issuer,subject],
    );
    const row=result.rows[0];
    if(!row) throw new RegistrationDocumentError("DOCUMENT_NOT_FOUND","Le justificatif est introuvable.");
    const response=await storageRequest(row.storage_path,{method:"GET"});
    if(!response.ok || !response.body) throw new RegistrationDocumentError("DOCUMENT_STORAGE_FAILED","Le justificatif n’est pas disponible.");
    return {body:response.body,contentType:row.content_type,filename:row.original_filename};
  },

  async remove(issuer:string,subject:string,draftId:string,documentId:string) {
    const result=await pool.query<{storage_path:string}>(
      `SELECT d.storage_path FROM public.finance_registration_documents d
         JOIN public.finance_registration_drafts r ON r.id=d.draft_id
        WHERE d.id=$1 AND d.draft_id=$2 AND d.identity_issuer=$3 AND d.identity_subject=$4
          AND r.identity_issuer=$3 AND r.identity_subject=$4 AND d.status='UPLOADED' AND r.status='DRAFT'`,
      [documentId,draftId,issuer,subject],
    );
    const row=result.rows[0];
    if(!row) throw new RegistrationDocumentError("DOCUMENT_NOT_REMOVABLE","Ce justificatif ne peut plus être supprimé.");
    const deleted=await storageRequest(row.storage_path,{method:"DELETE"});
    if(!deleted.ok && deleted.status!==404) throw new RegistrationDocumentError("DOCUMENT_STORAGE_FAILED","Le fichier n’a pas pu être supprimé.");
    await pool.query("UPDATE public.finance_registration_documents SET status='REMOVED',updated_at=now() WHERE id=$1",[documentId]);
  },
};
