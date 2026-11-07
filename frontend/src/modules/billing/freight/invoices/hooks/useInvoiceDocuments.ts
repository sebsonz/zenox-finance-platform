import { useCallback } from "react";
import type { InvoiceDraftRecord } from "../types/invoice-draft.js";
import type { ApiError } from "../types/workspace-resources.js";

type Options = {
  tenantId: string;
  setBusy: (busy: boolean) => void;
  setNotice: (message: string) => void;
};

async function responseError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = await response.json() as ApiError;
    return payload.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function useInvoiceDocuments({ tenantId, setBusy, setNotice }: Options) {
  const openIssuedDocument = useCallback((invoice: InvoiceDraftRecord) => {
    if (invoice.status !== "ISSUED") {
      setNotice("Seules les factures émises disposent d’un document définitif consultable.");
      return;
    }
    // Keep the window.open call synchronous with the user's click.
    window.open(
      `/api/v1/user/tenants/${tenantId}/invoices/${invoice.id}/document`,
      "_blank",
      "noopener,noreferrer",
    );
  }, [tenantId, setNotice]);

  const downloadDocument = useCallback(async (
    invoice: InvoiceDraftRecord,
    format: "document" | "document.pdf",
  ) => {
    setBusy(true);
    try {
      const response = await fetch(`/api/v1/user/tenants/${tenantId}/invoices/${invoice.id}/${format}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) throw new Error(await responseError(response, "Téléchargement impossible."));
      downloadBlob(await response.blob(), `${invoice.invoiceCode ?? "facture"}.${format.endsWith(".pdf") ? "pdf" : "html"}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Téléchargement impossible.");
    } finally {
      setBusy(false);
    }
  }, [tenantId, setBusy, setNotice]);

  return { openIssuedDocument, downloadDocument };
}
