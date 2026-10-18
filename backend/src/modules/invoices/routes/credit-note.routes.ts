import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { requireIntegrationAuth } from "../../../middleware/require-integration-auth.js";
import { CreditNoteServiceError, creditNoteService } from "../services/credit-note.service.js";

export const creditNoteRouter = Router();
const requestSchema = z.object({ reason: z.string().trim().min(3).max(2000) }).strict();

creditNoteRouter.post(
  "/:invoiceId/credit-notes",
  requireIntegrationAuth(["invoice:credit"]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const context = req.financeContext;
    if (!context) { res.status(401).json({ error: { code: "UNAUTHENTICATED" } }); return; }
    const invoiceId = z.string().uuid().safeParse(req.params["invoiceId"]);
    if (!invoiceId.success) { res.status(400).json({ error: { code: "INVALID_INVOICE_ID" } }); return; }
    const body = requestSchema.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: { code: "INVALID_REQUEST", issues: body.error.issues } }); return; }
    try {
      const creditNote = await creditNoteService.issueFullReversal(context, invoiceId.data, body.data.reason);
      res.status(201).json({ data: { creditNote, correlationId: context.correlationId } });
    } catch (error) {
      if (error instanceof CreditNoteServiceError) {
        const status = error.code === "CREDIT_NOTE_ALREADY_EXISTS" ? 409 :
          error.code === "SOURCE_INVOICE_NOT_ISSUED" ? 409 : 422;
        res.status(status).json({ error: { code: error.code, message: error.message, correlationId: context.correlationId } });
        return;
      }
      if (error instanceof Error && error.message === "CREDIT_NOTE_SEQUENCE_ALLOCATION_FAILED") {
        res.status(500).json({ error: { code: error.message, correlationId: context.correlationId } }); return;
      }
      next(error);
    }
  },
);

creditNoteRouter.get(
  "/credit-notes/:creditNoteId/document",
  requireIntegrationAuth(["invoice:read"]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const context = req.financeContext;
    if (!context) { res.status(401).json({ error: { code: "UNAUTHENTICATED" } }); return; }
    const id = z.string().uuid().safeParse(req.params["creditNoteId"]);
    if (!id.success) { res.status(400).json({ error: { code: "INVALID_CREDIT_NOTE_ID" } }); return; }
    try {
      const artifact = await creditNoteService.findDocument(context, id.data);
      if (!artifact) { res.status(404).json({ error: { code: "CREDIT_NOTE_NOT_FOUND" } }); return; }
      res.setHeader("Content-Type", artifact.contentType);
      res.setHeader("Content-Disposition", `inline; filename="${artifact.creditNoteCode}.html"`);
      res.setHeader("ETag", `"sha256-${artifact.sha256}"`);
      res.setHeader("Cache-Control", "private, no-store");
      res.status(200).send(artifact.content);
    } catch (error) { next(error); }
  },
);

creditNoteRouter.get(
  "/credit-notes/:creditNoteId/document.pdf",
  requireIntegrationAuth(["invoice:read"]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const context = req.financeContext;
    if (!context) { res.status(401).json({ error: { code: "UNAUTHENTICATED" } }); return; }
    const id = z.string().uuid().safeParse(req.params["creditNoteId"]);
    if (!id.success) { res.status(400).json({ error: { code: "INVALID_CREDIT_NOTE_ID" } }); return; }
    try {
      const artifact = await creditNoteService.findPdf(context, id.data);
      if (!artifact) { res.status(404).json({ error: { code: "CREDIT_NOTE_NOT_FOUND" } }); return; }
      res.setHeader("Content-Type", artifact.contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${artifact.creditNoteCode}.pdf"`);
      res.setHeader("ETag", `"sha256-${artifact.sha256}"`);
      res.setHeader("Cache-Control", "private, no-store");
      res.status(200).send(artifact.content);
    } catch (error) { next(error); }
  },
);
