import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { requireUserAuth } from "../../../middleware/require-user-auth.js";
import { registrationDocumentReviewService } from "../application/registration-document-review.service.js";
import { RegistrationDocumentError } from "../application/registration-document.service.js";

export const registrationDocumentReviewRouter = Router({ mergeParams: true });
const uuid = z.string().uuid();
const decisionSchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("ACCEPT"), note: z.string().max(1000).nullable().optional() }).strict(),
  z.object({ decision: z.literal("REJECT"), note: z.string().trim().min(10).max(1000) }).strict(),
]);
function sameOrigin(req: Request): boolean {
  const origin = req.header("origin"); if (!origin) return false;
  try { const parsed = new URL(origin); return ["https:", "http:"].includes(parsed.protocol) && parsed.host.toLowerCase() === (req.get("host") ?? "").toLowerCase(); } catch { return false; }
}
function context(req: Request, res: Response) {
  const user = req.financeUser;
  if (!user) { res.status(401).json({ error: { code: "UNAUTHENTICATED" } }); return null; }
  if (!user.emailConfirmedAt) { res.status(403).json({ error: { code: "EMAIL_CONFIRMATION_REQUIRED" } }); return null; }
  return user;
}
function ids(req: Request, res: Response) {
  const requestId = uuid.safeParse(req.params["requestId"]);
  if (!requestId.success) { res.status(400).json({ error: { code: "INVALID_REGISTRATION_ID" } }); return null; }
  return requestId.data;
}
function handleError(error: unknown, res: Response, next: (error?: unknown) => void) {
  if (error instanceof RegistrationDocumentError) {
    const status = error.code === "DOCUMENT_NOT_FOUND" ? 404 : error.code === "DOCUMENT_STORAGE_UNAVAILABLE" ? 503 : 422;
    res.status(status).json({ error: { code: error.code, message: error.message } }); return;
  }
  const db = error as { code?: string; message?: string };
  if (db.code === "42501") { res.status(403).json({ error: { code: "PLATFORM_OPERATOR_REQUIRED" } }); return; }
  if (db.code === "P0002") { res.status(404).json({ error: { code: db.message ?? "DOCUMENT_NOT_FOUND" } }); return; }
  if (db.code === "22023") { res.status(422).json({ error: { code: db.message ?? "INVALID_DOCUMENT_REVIEW" } }); return; }
  next(error);
}

registrationDocumentReviewRouter.use(requireUserAuth());
registrationDocumentReviewRouter.get("/", async (req, res, next) => {
  const user = context(req, res); const requestId = ids(req, res); if (!user || !requestId) return;
  try { res.setHeader("Cache-Control", "no-store"); res.json({ data: { documents: await registrationDocumentReviewService.list(user.issuer, user.id, requestId) } }); }
  catch (error) { handleError(error, res, next); }
});

registrationDocumentReviewRouter.get("/:documentId/content", async (req, res, next) => {
  const user = context(req, res); const requestId = ids(req, res); const documentId = uuid.safeParse(req.params["documentId"]);
  if (!user || !requestId) return;
  if (!documentId.success) { res.status(404).json({ error: { code: "DOCUMENT_NOT_FOUND" } }); return; }
  try {
    const file = await registrationDocumentReviewService.download(user.issuer, user.id, requestId, documentId.data);
    res.setHeader("Cache-Control", "private,no-store"); res.setHeader("Content-Type", file.contentType);
    res.setHeader("Content-Disposition", "attachment; filename=" + encodeURIComponent(file.filename));
    res.setHeader("X-Content-Type-Options", "nosniff");
    const reader = file.body.getReader();
    while (true) { const chunk = await reader.read(); if (chunk.done) break; res.write(chunk.value); }
    res.end();
  } catch (error) { handleError(error, res, next); }
});

registrationDocumentReviewRouter.post("/:documentId/review", async (req, res, next) => {
  if (!sameOrigin(req)) { res.status(403).json({ error: { code: "ORIGIN_NOT_ALLOWED" } }); return; }
  const user = context(req, res); const requestId = ids(req, res); const documentId = uuid.safeParse(req.params["documentId"]);
  if (!user || !requestId) return;
  const parsed = decisionSchema.safeParse(req.body);
  if (!documentId.success || !parsed.success) { res.status(400).json({ error: { code: "VALIDATION_ERROR" } }); return; }
  try {
    const row = await registrationDocumentReviewService.review(user.issuer, user.id, requestId, documentId.data, parsed.data.decision, parsed.data.note ?? null);
    res.setHeader("Cache-Control", "no-store"); res.json({ data: { document: row } });
  } catch (error) { handleError(error, res, next); }
});
