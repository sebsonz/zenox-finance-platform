import { Router } from "express";
import { ZodError } from "zod";
import { requireIntegrationAuth } from "../../../middleware/require-integration-auth.js";
import { taxSnapshotService, TaxSnapshotServiceError } from "../services/tax-snapshot.service.js";
import { createTaxSnapshotSchema } from "../validators/tax-snapshot.schema.js";

export const taxSnapshotRouter = Router();

taxSnapshotRouter.post(
  "/snapshots",
  requireIntegrationAuth(["tax:snapshot:write"]),
  async (req, res, next) => {
    try {
      const context = req.financeContext;
      if (!context) {
        res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Authenticated integration context is required." } });
        return;
      }

      const input = createTaxSnapshotSchema.parse(req.body);
      const snapshot = await taxSnapshotService.create(context, input);
      res.status(201).json({ data: snapshot });
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: "The request body is invalid.",
            details: error.issues.map((issue) => ({ path: issue.path, code: issue.code })),
          },
        });
        return;
      }
      if (error instanceof TaxSnapshotServiceError) {
        const status = error.code === "CURRENCY_NOT_SUPPORTED" ? 422 : 409;
        res.status(status).json({ error: { code: error.code, message: error.message } });
        return;
      }
      next(error);
    }
  },
);

taxSnapshotRouter.get(
  "/snapshots/:documentType/:documentId/:documentVersion",
  requireIntegrationAuth(["tax:snapshot:read"]),
  async (req, res, next) => {
    try {
      const context = req.financeContext;
      if (!context) {
        res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Authenticated integration context is required." } });
        return;
      }

      const documentType = req.params["documentType"];
      const documentId = req.params["documentId"];
      const versionText = req.params["documentVersion"];
      const version = Number(versionText);

      if (
        !["INVOICE", "CREDIT_NOTE", "DEBIT_NOTE", "RECEIPT", "OTHER"].includes(documentType ?? "") ||
        !documentId ||
        !Number.isSafeInteger(version) ||
        version <= 0
      ) {
        res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Document type, UUID, or version is invalid." } });
        return;
      }

      const parsed = createTaxSnapshotSchema.shape.documentId.safeParse(documentId);
      if (!parsed.success) {
        res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Document type, UUID, or version is invalid." } });
        return;
      }

      const snapshot = await taxSnapshotService.findByDocumentVersion(
        context,
        documentType as "INVOICE" | "CREDIT_NOTE" | "DEBIT_NOTE" | "RECEIPT" | "OTHER",
        parsed.data,
        version,
      );
      if (!snapshot) {
        res.status(404).json({ error: { code: "TAX_SNAPSHOT_NOT_FOUND", message: "No tax snapshot exists for this document version." } });
        return;
      }
      res.status(200).json({ data: snapshot });
    } catch (error) {
      next(error);
    }
  },
);
