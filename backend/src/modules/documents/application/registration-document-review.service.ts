import { pool } from "../../../db/pool.js";
import { env } from "../../../config/env.js";
import { RegistrationDocumentError } from "./registration-document.service.js";

const BUCKET = "zenox-registration-documents";

async function storage(path: string): Promise<Response> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new RegistrationDocumentError("DOCUMENT_STORAGE_UNAVAILABLE", "Le stockage privé des justificatifs n’est pas configuré.");
  }
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const base = env.SUPABASE_URL.replace(/\/$/, "");
  return fetch(base + "/storage/v1/object/" + BUCKET + "/" + path, {
    headers: { apikey: key, authorization: "Bearer " + key },
  });
}

export const registrationDocumentReviewService = {
  async list(issuer: string, subject: string, requestId: string) {
    const result = await pool.query("SELECT * FROM public.finance_list_registration_documents_for_review($1,$2,$3)", [issuer, subject, requestId]);
    return result.rows;
  },

  async download(issuer: string, subject: string, requestId: string, documentId: string) {
    const metadata = await pool.query<{storage_path:string;content_type:string;original_filename:string}>("SELECT * FROM public.finance_get_registration_document_for_review($1,$2,$3,$4)", [issuer, subject, requestId, documentId]);
    const row = metadata.rows[0];
    if (!row) throw new RegistrationDocumentError("DOCUMENT_NOT_FOUND", "Le justificatif est introuvable.");
    const response = await storage(row.storage_path);
    if (!response.ok || !response.body) throw new RegistrationDocumentError("DOCUMENT_STORAGE_FAILED", "Le justificatif n’est pas disponible.");
    return { body: response.body, contentType: row.content_type, filename: row.original_filename };
  },

  async review(issuer: string, subject: string, requestId: string, documentId: string, decision: "ACCEPT" | "REJECT", note: string | null) {
    const result = await pool.query("SELECT * FROM public.finance_review_registration_document($1,$2,$3,$4,$5,$6)", [issuer, subject, requestId, documentId, decision, note]);
    return result.rows[0];
  },
};