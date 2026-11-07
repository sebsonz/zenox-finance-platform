import { useCallback, useState } from "react";
import type { InvoiceDraftRecord } from "../types/invoice-draft.js";
import type { ApiError, ApiPayload } from "../types/workspace-resources.js";

export type CreditNoteRecord = {
  id: string;
  originalInvoiceId: string;
  creditNoteCode: string;
  creditKind: "FULL" | "PARTIAL";
  status: "ISSUED";
  reason: string;
  currencyCode: string;
  grandTotal: string;
  amountDue: string;
  issuedAt: string;
};

type Options = {
  tenantId: string;
  setSelectedInvoiceId: (id: string) => void;
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

async function readData<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) throw new Error(await responseError(response, fallback));
  const payload = await response.json() as ApiPayload<T>;
  if (!payload.data) throw new Error(fallback);
  return payload.data;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function useCreditNotes({ tenantId, setSelectedInvoiceId, setBusy, setNotice }: Options) {
  const [creditNotes, setCreditNotes] = useState<CreditNoteRecord[]>([]);
  const [creditReason, setCreditReason] = useState("Correction commerciale / retour / annulation");
  const [creditAmount, setCreditAmount] = useState("");
  const [creditNoteReason, setCreditNoteReason] = useState("Correction commerciale / retour / annulation");
  const [creditNoteAmount, setCreditNoteAmount] = useState("");

  const resetCreditNotes = useCallback(() => setCreditNotes([]), []);

  const loadCreditNotes = useCallback(async (invoice: InvoiceDraftRecord) => {
    setSelectedInvoiceId(invoice.id);
    try {
      const data = await readData<{ creditNotes?: CreditNoteRecord[] }>(
        await fetch(`/api/v1/user/tenants/${tenantId}/invoices/${invoice.id}/credit-notes`, {
          credentials: "same-origin",
          cache: "no-store",
        }),
        "Impossible de charger les avoirs.",
      );
      setCreditNotes(data.creditNotes ?? []);
    } catch (error) {
      setCreditNotes([]);
      setNotice(error instanceof Error ? error.message : "Impossible de charger les avoirs.");
    }
  }, [tenantId, setSelectedInvoiceId, setNotice]);

  const createCreditNote = useCallback(async (
    invoice: InvoiceDraftRecord,
    reason: string,
    amount: string,
  ) => {
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch(`/api/v1/user/tenants/${tenantId}/invoices/${invoice.id}/credit-notes`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: reason.trim(), ...(amount.trim() ? { amount: amount.trim() } : {}) }),
      });
      await readData(response, "La création de l’avoir a échoué.");
      setSelectedInvoiceId(invoice.id);
      await loadCreditNotes(invoice);
      setCreditNoteAmount("");
      setNotice(amount.trim() ? "Avoir partiel émis et enregistré." : "Avoir intégral émis et enregistré.");
      return true;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "La création de l’avoir a échoué.");
      return false;
    } finally {
      setBusy(false);
    }
  }, [tenantId, setBusy, setNotice, setSelectedInvoiceId, loadCreditNotes]);

  const issueCreditNote = useCallback(async (invoice: InvoiceDraftRecord) => {
    if (!window.confirm(creditAmount.trim()
      ? `Émettre un avoir partiel irréversible de ${creditAmount} ${invoice.currencyCode} ?`
      : "Créer un avoir intégral irréversible pour cette facture ?")) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/v1/user/tenants/${tenantId}/invoices/${invoice.id}/credit-notes`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: creditReason, ...(creditAmount.trim() ? { amount: creditAmount.trim() } : {}) }),
      });
      await readData(response, "La création de l’avoir a échoué.");
      setNotice(creditAmount.trim() ? "Avoir partiel émis et enregistré." : "Avoir intégral émis et enregistré.");
      setCreditAmount("");
      await loadCreditNotes(invoice);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "La création de l’avoir a échoué.");
    } finally {
      setBusy(false);
    }
  }, [tenantId, creditAmount, creditReason, setBusy, setNotice, loadCreditNotes]);

  const downloadCreditNote = useCallback(async (id: string, format: "document" | "document.pdf", code: string) => {
    setBusy(true);
    try {
      const response = await fetch(`/api/v1/user/tenants/${tenantId}/invoices/credit-notes/${id}/${format}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) throw new Error(await responseError(response, "Téléchargement impossible."));
      downloadBlob(await response.blob(), `${code}.${format.endsWith(".pdf") ? "pdf" : "html"}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Téléchargement impossible.");
    } finally {
      setBusy(false);
    }
  }, [tenantId, setBusy, setNotice]);

  const openCreditNoteDocument = useCallback((id: string) => {
    window.open(
      `/api/v1/user/tenants/${tenantId}/invoices/credit-notes/${id}/document`,
      "_blank",
      "noopener,noreferrer",
    );
  }, [tenantId]);

  return {
    creditNotes, creditReason, setCreditReason, creditAmount, setCreditAmount,
    creditNoteReason, setCreditNoteReason, creditNoteAmount, setCreditNoteAmount,
    resetCreditNotes, loadCreditNotes, createCreditNote, issueCreditNote,
    downloadCreditNote, openCreditNoteDocument,
  };
}
