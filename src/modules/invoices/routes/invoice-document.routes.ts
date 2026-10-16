import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { requireIntegrationAuth } from "../../../middleware/require-integration-auth.js";
import { invoiceDocumentService } from "../services/invoice-document.service.js";

export const invoiceDocumentRouter = Router();

invoiceDocumentRouter.get(
  "/:invoiceId/document",
  requireIntegrationAuth(["invoice:read"]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const context = req.financeContext;
    if (!context) {
      res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "A verified Finance context is required." } });
      return;
    }
    const parsedId = z.string().uuid().safeParse(req.params["invoiceId"]);
    if (!parsedId.success) {
      res.status(400).json({ error: { code: "INVALID_INVOICE_ID", message: "The invoice ID must be a UUID." } });
      return;
    }
    try {
      const artifact = await invoiceDocumentService.findForInvoice(context, parsedId.data);
      if (!artifact) {
        res.status(404).json({ error: { code: "INVOICE_DOCUMENT_NOT_FOUND", message: "No immutable issued HTML document exists for this invoice." } });
        return;
      }
      res.setHeader("Content-Type", artifact.contentType);
      res.setHeader("Content-Disposition", `inline; filename="${artifact.invoiceCode}.html"`);
      res.setHeader("ETag", `"sha256-${artifact.contentSha256}"`);
      res.setHeader("X-Document-SHA256", artifact.contentSha256);
      res.setHeader("Cache-Control", "private, no-store");
      res.status(200).send(artifact.htmlContent);
    } catch (error) { next(error); }
  },
);

invoiceDocumentRouter.get(
  "/:invoiceId/document.pdf",
  requireIntegrationAuth(["invoice:read"]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const context = req.financeContext;
    if (!context) {
      res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "A verified Finance context is required." } });
      return;
    }
    const parsedId = z.string().uuid().safeParse(req.params["invoiceId"]);
    if (!parsedId.success) {
      res.status(400).json({ error: { code: "INVALID_INVOICE_ID", message: "The invoice ID must be a UUID." } });
      return;
    }
    try {
      const artifact = await invoiceDocumentService.findPdfForInvoice(context, parsedId.data);
      if (!artifact) {
        res.status(404).json({ error: { code: "INVOICE_PDF_NOT_FOUND", message: "No immutable issued PDF exists for this invoice." } });
        return;
      }
      res.setHeader("Content-Type", artifact.contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${artifact.invoiceCode}.pdf"`);
      res.setHeader("ETag", `"sha256-${artifact.contentSha256}"`);
      res.setHeader("X-Document-SHA256", artifact.contentSha256);
      res.setHeader("Cache-Control", "private, no-store");
      res.status(200).send(artifact.pdfContent);
    } catch (error) { next(error); }
  },
);
