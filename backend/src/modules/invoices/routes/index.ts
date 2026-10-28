import { Router } from "express";
import { invoiceDraftRouter } from "./invoice-draft.routes.js";
import { invoiceTaxSnapshotRouter } from "./invoice-tax-snapshot.routes.js";
import { invoiceIssuanceRouter } from "./invoice-issuance.routes.js";
import { invoiceDocumentRouter } from "./invoice-document.routes.js";
import { creditNoteRouter } from "./credit-note.routes.js";

/** Composes all invoice endpoints while preserving their existing URL prefixes. */
export const invoicesRouter = Router();

invoicesRouter.use("/", invoiceTaxSnapshotRouter);
invoicesRouter.use("/", invoiceIssuanceRouter);
invoicesRouter.use("/", invoiceDocumentRouter);
invoicesRouter.use("/", creditNoteRouter);
invoicesRouter.use("/", invoiceDraftRouter);
